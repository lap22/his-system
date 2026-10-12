using HIS.Api.Data;
using HIS.Api.DTOs.Queue;
using HIS.Api.Entities;
using HIS.Api.Enums;
using Microsoft.EntityFrameworkCore;
using System.Data;
using Microsoft.Data.SqlClient;
using HIS.Api.Helpers;
using HIS.Api.Exceptions;
namespace HIS.Api.Services;

public class QueueService : IQueueService
{
    private readonly AppDbContext _dbContext;
    private readonly ILogger<QueueService> _logger;
    private readonly IQueueNotifier _queueNotifier;
    private async Task SaveQueueChangesAsync()
    {
        try
        {
            await _dbContext.SaveChangesAsync();
        }
        catch (DbUpdateConcurrencyException ex)
        {
            _logger.LogWarning(
                ex,
                "Concurrent queue update detected.");

            throw new QueueConcurrencyException();
        }
    }

    public QueueService(
        AppDbContext dbContext,
        IQueueNotifier queueNotifier,
        ILogger<QueueService> logger)
    {
        _dbContext = dbContext;
        _queueNotifier = queueNotifier;
        _logger = logger;
    }

    public async Task<QueueEntryResponse> CheckInAsync(
        Guid currentUserId,
        Guid appointmentId)
    {
        // 1. Đọc thông tin Appointment và kiểm tra ownership.
        var appointment = await _dbContext.Appointments
            .Include(x => x.PatientProfile)
            .Include(x => x.Doctor)
            .Include(x => x.QueueEntry)
            .FirstOrDefaultAsync(x =>
                x.Id == appointmentId &&
                x.PatientProfile.UserId == currentUserId);

        if (appointment == null)
        {
            throw new KeyNotFoundException(
                "Appointment not found.");
        }

        // 2. Kiểm tra ngày khám.
        var today = HospitalClock.Today;

        if (appointment.AppointmentDate != today)
        {
            throw new InvalidOperationException(
                "Check-in is only allowed on the appointment date.");
        }

        // 3. Bắt đầu transaction.
        await using var transaction =
            await _dbContext.Database.BeginTransactionAsync(
                IsolationLevel.ReadCommitted);

        // 4. Tạo khóa theo Doctor + AppointmentDate.
        // Các Patient của cùng bác sĩ và cùng ngày sẽ
        // được cấp QueueNumber tuần tự.
        var lockResource =
            $"queue:{appointment.DoctorId:N}:{appointment.AppointmentDate:yyyyMMdd}";

        var lockResult = new SqlParameter(
            "@lockResult",
            SqlDbType.Int)
        {
            Direction = ParameterDirection.Output
        };

        var resourceParameter = new SqlParameter(
            "@resource",
            SqlDbType.NVarChar,
            255)
        {
            Value = lockResource
        };

        // 5. Xin exclusive application lock.
        await _dbContext.Database.ExecuteSqlRawAsync(
            """
        EXEC @lockResult = sp_getapplock
            @Resource = @resource,
            @LockMode = 'Exclusive',
            @LockOwner = 'Transaction',
            @LockTimeout = 10000;
        """,
            lockResult,
            resourceParameter);

        var lockCode = (int)lockResult.Value;

        if (lockCode < 0)
        {
            throw new InvalidOperationException(
                "Could not acquire queue numbering lock.");
        }

        // 6. Đọc lại trạng thái mới nhất từ database.
        // Không dùng trạng thái đã được load trước transaction.
        var latestAppointment = await _dbContext.Appointments
            .AsNoTracking()
            .Where(x => x.Id == appointmentId)
            .Select(x => new
            {
                x.Status,
                x.DoctorId,
                x.AppointmentDate
            })
            .SingleOrDefaultAsync();

        if (latestAppointment == null)
        {
            throw new KeyNotFoundException(
                "Appointment not found.");
        }

        if (latestAppointment.Status != AppointmentStatus.Confirmed)
        {
            throw new InvalidOperationException(
                "Only confirmed appointments can be checked in.");
        }

        if (latestAppointment.DoctorId != appointment.DoctorId ||
            latestAppointment.AppointmentDate != appointment.AppointmentDate)
        {
            throw new InvalidOperationException(
                "Appointment information has changed.");
        }

        // 7. Chặn check-in trùng.
        var alreadyCheckedIn = await _dbContext.QueueEntries
            .AnyAsync(x => x.AppointmentId == appointmentId);

        if (alreadyCheckedIn)
        {
            throw new InvalidOperationException(
                "This appointment has already been checked in.");
        }

        // 8. Lấy số thứ tự lớn nhất theo Doctor + Date.
        var maxQueueNumber = await _dbContext.QueueEntries
            .Where(x =>
                x.DoctorId == appointment.DoctorId &&
                x.AppointmentDate == appointment.AppointmentDate)
            .Select(x => (int?)x.QueueNumber)
            .MaxAsync() ?? 0;

        // 9. Tạo QueueEntry.
        var now = DateTime.UtcNow;

        var queueEntry = new QueueEntry
        {
            AppointmentId = appointment.Id,
            DoctorId = appointment.DoctorId,
            AppointmentDate = appointment.AppointmentDate,
            QueueNumber = maxQueueNumber + 1,
            Status = QueueStatus.Waiting,
            CheckedInAt = now
        };

        // 10. Đồng bộ trạng thái Appointment.
        appointment.Status = AppointmentStatus.CheckedIn;
        appointment.UpdatedAt = now;

        _dbContext.QueueEntries.Add(queueEntry);

        // 11. Lưu dữ liệu và commit transaction.
        await _dbContext.SaveChangesAsync();
        await transaction.CommitAsync();

        // 12. Chỉ gửi SignalR sau khi commit thành công.
        queueEntry.Appointment = appointment;

        await TryNotifyQueueUpdatedAsync(queueEntry);

        // 13. Trả về kết quả.
        return MapToResponse(queueEntry, appointment);
    }

    private async Task TryNotifyQueueUpdatedAsync(
    QueueEntry queueEntry)
    {
        try
        {
            await NotifyQueueUpdatedAsync(queueEntry);
        }
        catch (Exception ex)
        {
            _logger.LogError(
                ex,
                "Failed to notify QueueUpdated for QueueEntry {QueueEntryId}",
                queueEntry.Id);
        }
    }

    private static QueueEntryResponse MapToResponse(
        QueueEntry queueEntry,
        Appointment appointment)
    {
        return new QueueEntryResponse
        {
            Id = queueEntry.Id,
            AppointmentId = appointment.Id,
            QueueNumber = queueEntry.QueueNumber,
            Status = queueEntry.Status,

            PatientProfileId = appointment.PatientProfileId,
            PatientName = appointment.PatientProfile.FullName,

            DoctorId = appointment.DoctorId,
            DoctorName = appointment.Doctor.FullName,

            AppointmentDate = appointment.AppointmentDate,
            AppointmentTime = appointment.StartTime,

            CheckedInAt = queueEntry.CheckedInAt,
            CalledAt = queueEntry.CalledAt,
            StartedAt = queueEntry.StartedAt,
            CompletedAt = queueEntry.CompletedAt
        };

    }
    private async Task<QueueEntry?> GetDoctorOwnedQueueEntryAsync(
            Guid currentUserId,
            Guid queueEntryId)
    {
        return await _dbContext.QueueEntries
        .Include(x => x.Appointment)
            .ThenInclude(x => x.PatientProfile)
        .Include(x => x.Appointment)
            .ThenInclude(x => x.Doctor)
        .FirstOrDefaultAsync(x =>
            x.Id == queueEntryId &&
            x.Appointment.Doctor.UserId == currentUserId &&
            x.Appointment.Doctor.IsActive);
    }
    private async Task NotifyQueueUpdatedAsync(
    QueueEntry queueEntry)
    {
        var appointment = queueEntry.Appointment;

        var response = MapToResponse(
            queueEntry,
            appointment);

        await _queueNotifier.NotifyQueueUpdatedAsync(
            appointment.PatientProfile.UserId,
            appointment.Doctor.UserId,
            response);
    }


    public async Task<List<QueueEntryResponse>> GetMyQueueAsync(
        Guid currentUserId)
    {
        var queueEntries = await _dbContext.QueueEntries
            .AsNoTracking()
            .Include(x => x.Appointment)
                .ThenInclude(x => x.PatientProfile)
            .Include(x => x.Appointment)
                .ThenInclude(x => x.Doctor)
            .Where(x =>
                x.Appointment.PatientProfile.UserId == currentUserId)
            .OrderByDescending(x => x.Appointment.AppointmentDate)
            .ThenBy(x => x.QueueNumber)
            .ToListAsync();

        return queueEntries
            .Select(x => MapToResponse(x, x.Appointment))
            .ToList();
    }

    public async Task<List<QueueEntryResponse>> GetDoctorQueueAsync(
        Guid currentUserId,
        DateOnly? date)
    {
        var doctor = await _dbContext.Doctors
            .AsNoTracking()
            .FirstOrDefaultAsync(x =>
                x.UserId == currentUserId &&
                x.IsActive);

        if (doctor == null)
        {
            throw new KeyNotFoundException("Doctor not found.");
        }

        var targetDate = date ?? HospitalClock.Today;

        var queueEntries = await _dbContext.QueueEntries
            .AsNoTracking()
            .Include(x => x.Appointment)
                .ThenInclude(x => x.PatientProfile)
            .Include(x => x.Appointment)
                .ThenInclude(x => x.Doctor)
            .Where(x =>
                x.Appointment.DoctorId == doctor.Id &&
                x.Appointment.AppointmentDate == targetDate)
            .OrderBy(x => x.QueueNumber)
            .ToListAsync();

        return queueEntries
            .Select(x => MapToResponse(x, x.Appointment))
            .ToList();
    }

    public async Task<QueueEntryResponse?> CallAsync(
        Guid currentUserId,
        Guid queueEntryId)
    {
        var queueEntry = await GetDoctorOwnedQueueEntryAsync(
            currentUserId,
            queueEntryId);

        if (queueEntry == null)
        {
            return null;
        }

        if (queueEntry.Status != QueueStatus.Waiting)
        {
            throw new InvalidOperationException(
                "Only waiting queue entries can be called.");
        }

        queueEntry.Status = QueueStatus.Called;
        queueEntry.CalledAt = DateTime.UtcNow;

        await SaveQueueChangesAsync();
        await TryNotifyQueueUpdatedAsync(queueEntry);
        return MapToResponse(
            queueEntry,
            queueEntry.Appointment);
    }


    public async Task<QueueEntryResponse?> StartAsync(
        Guid currentUserId,
        Guid queueEntryId)
    {
        var queueEntry = await GetDoctorOwnedQueueEntryAsync(
            currentUserId,
            queueEntryId);

        if (queueEntry == null)
        {
            return null;
        }

        if (queueEntry.Status != QueueStatus.Called)
        {
            throw new InvalidOperationException(
                "Only called queue entries can be started.");
        }

        if (queueEntry.Appointment.Status != AppointmentStatus.CheckedIn)
        {
            throw new InvalidOperationException(
                "Appointment must be checked in before starting.");
        }

        queueEntry.Status = QueueStatus.InService;
        queueEntry.StartedAt = DateTime.UtcNow;

        queueEntry.Appointment.Status = AppointmentStatus.InProgress;
        queueEntry.Appointment.UpdatedAt = DateTime.UtcNow;

        await SaveQueueChangesAsync();
        await TryNotifyQueueUpdatedAsync(queueEntry);
        return MapToResponse(
            queueEntry,
            queueEntry.Appointment);
    }

    public async Task<QueueEntryResponse?> CompleteAsync(
        Guid currentUserId,
        Guid queueEntryId)
    {
        var queueEntry = await GetDoctorOwnedQueueEntryAsync(
            currentUserId,
            queueEntryId);

        if (queueEntry == null)
        {
            return null;
        }

        if (queueEntry.Status != QueueStatus.InService)
        {
            throw new InvalidOperationException(
                "Only queue entries in service can be completed.");
        }

        if (queueEntry.Appointment.Status != AppointmentStatus.InProgress)
        {
            throw new InvalidOperationException(
                "Appointment must be in progress before completion.");
        }

        queueEntry.Status = QueueStatus.Completed;
        queueEntry.CompletedAt = DateTime.UtcNow;

        queueEntry.Appointment.Status = AppointmentStatus.Completed;
        queueEntry.Appointment.UpdatedAt = DateTime.UtcNow;

        await SaveQueueChangesAsync();
        await TryNotifyQueueUpdatedAsync(queueEntry);
        return MapToResponse(
            queueEntry,
            queueEntry.Appointment);
    }
}