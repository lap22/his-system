using HIS.Api.Data;
using HIS.Api.DTOs.DoctorSchedules;
using HIS.Api.Entities;
using HIS.Api.Enums;
using HIS.Api.Exceptions;
using HIS.Api.Helpers;
using Microsoft.EntityFrameworkCore;
using System.Data;

namespace HIS.Api.Services;

public class DoctorScheduleService : IDoctorScheduleService
{
    private readonly AppDbContext _dbContext;

    public DoctorScheduleService(AppDbContext dbContext)
    {
        _dbContext = dbContext;
    }

    public async Task<List<DoctorScheduleResponse>> GetAllAsync(
        Guid? doctorId = null,
        DayOfWeek? dayOfWeek = null,
        bool? isActive = null)
    {
        var query = _dbContext.DoctorSchedules
            .AsNoTracking()
            .Include(x => x.Doctor)
            .AsQueryable();

        if (doctorId.HasValue)
        {
            query = query.Where(x =>
                x.DoctorId == doctorId.Value);
        }

        if (dayOfWeek.HasValue)
        {
            query = query.Where(x =>
                x.DayOfWeek == dayOfWeek.Value);
        }

        if (isActive.HasValue)
        {
            query = query.Where(x =>
                x.IsActive == isActive.Value);
        }

        return await query
            .OrderBy(x => x.DayOfWeek)
            .ThenBy(x => x.StartTime)
            .Select(x => MapToResponse(x))
            .ToListAsync();
    }

    public async Task<DoctorScheduleResponse?> GetByIdAsync(Guid id)
    {
        var schedule = await _dbContext.DoctorSchedules
            .AsNoTracking()
            .Include(x => x.Doctor)
            .FirstOrDefaultAsync(x => x.Id == id);

        return schedule == null
            ? null
            : MapToResponse(schedule);
    }

    public async Task<DoctorScheduleResponse> CreateAsync(
        CreateDoctorScheduleRequest request)
    {
        ValidateSchedule(
            request.StartTime,
            request.EndTime,
            request.SlotDurationMinutes,
            request.MaxPatients);

        var doctor = await _dbContext.Doctors
            .Include(x => x.User)
            .Include(x => x.Department)
            .FirstOrDefaultAsync(x => x.Id == request.DoctorId);

        if (doctor == null)
        {
            throw new InvalidOperationException(
                "Doctor not found.");
        }

        ValidateDoctorAvailability(doctor);

        await using var transaction = await _dbContext.Database.BeginTransactionAsync(
            IsolationLevel.ReadCommitted);
        await AppointmentScheduleLock.AcquireExclusiveAsync(
            _dbContext.Database, request.DoctorId);

        var hasOverlap = await HasOverlapAsync(
            request.DoctorId,
            request.DayOfWeek,
            request.StartTime,
            request.EndTime);

        if (hasOverlap)
        {
            throw new InvalidOperationException(
                "The schedule overlaps with an existing schedule.");
        }

        var schedule = new DoctorSchedule
        {
            DoctorId = request.DoctorId,
            DayOfWeek = request.DayOfWeek,
            StartTime = request.StartTime,
            EndTime = request.EndTime,
            SlotDurationMinutes = request.SlotDurationMinutes,
            MaxPatients = request.MaxPatients,
            IsActive = true
        };

        _dbContext.DoctorSchedules.Add(schedule);

        await _dbContext.SaveChangesAsync();
        await transaction.CommitAsync();

        schedule.Doctor = doctor;

        return MapToResponse(schedule);
    }

    public async Task<DoctorScheduleResponse?> UpdateAsync(
        Guid id,
        UpdateDoctorScheduleRequest request)
    {
        ValidateSchedule(
            request.StartTime,
            request.EndTime,
            request.SlotDurationMinutes,
            request.MaxPatients);

        var doctorId = await _dbContext.DoctorSchedules
            .AsNoTracking()
            .Where(x => x.Id == id)
            .Select(x => (Guid?)x.DoctorId)
            .FirstOrDefaultAsync();

        if (!doctorId.HasValue)
        {
            return null;
        }

        await using var transaction = await _dbContext.Database.BeginTransactionAsync(
            IsolationLevel.ReadCommitted);
        await AppointmentScheduleLock.AcquireExclusiveAsync(
            _dbContext.Database, doctorId.Value);

        var schedule = await _dbContext.DoctorSchedules
            .Include(x => x.Doctor)
                .ThenInclude(x => x.User)
            .Include(x => x.Doctor)
                .ThenInclude(x => x.Department)
            .FirstOrDefaultAsync(x => x.Id == id);

        if (schedule == null)
        {
            return null;
        }

        ValidateDoctorAvailability(schedule.Doctor);

        var hasOverlap = await HasOverlapAsync(
            schedule.DoctorId,
            request.DayOfWeek,
            request.StartTime,
            request.EndTime,
            schedule.Id);

        if (hasOverlap)
        {
            throw new InvalidOperationException(
                "The schedule overlaps with an existing schedule.");
        }

        var proposed = new ScheduleCoverage(
            schedule.Id,
            schedule.DoctorId,
            request.DayOfWeek,
            request.StartTime,
            request.EndTime,
            request.SlotDurationMinutes,
            request.MaxPatients,
            schedule.IsActive);
        await EnsureFutureAppointmentsRemainCoveredAsync(schedule, proposed);

        schedule.DayOfWeek = request.DayOfWeek;
        schedule.StartTime = request.StartTime;
        schedule.EndTime = request.EndTime;
        schedule.SlotDurationMinutes =
            request.SlotDurationMinutes;
        schedule.MaxPatients = request.MaxPatients;

        await _dbContext.SaveChangesAsync();
        await transaction.CommitAsync();

        return MapToResponse(schedule);
    }

    public async Task<DoctorScheduleResponse?> UpdateStatusAsync(
        Guid id,
        UpdateDoctorScheduleStatusRequest request)
    {
        var doctorId = await _dbContext.DoctorSchedules
            .AsNoTracking()
            .Where(x => x.Id == id)
            .Select(x => (Guid?)x.DoctorId)
            .FirstOrDefaultAsync();

        if (!doctorId.HasValue)
        {
            return null;
        }

        await using var transaction = await _dbContext.Database.BeginTransactionAsync(
            IsolationLevel.ReadCommitted);
        await AppointmentScheduleLock.AcquireExclusiveAsync(
            _dbContext.Database, doctorId.Value);

        var schedule = await _dbContext.DoctorSchedules
            .Include(x => x.Doctor)
                .ThenInclude(x => x.User)
            .Include(x => x.Doctor)
                .ThenInclude(x => x.Department)
            .FirstOrDefaultAsync(x => x.Id == id);

        if (schedule == null)
        {
            return null;
        }

        // Re-activating a schedule requires the doctor
        // and department to still be available.
        if (request.IsActive)
        {
            ValidateDoctorAvailability(schedule.Doctor);

            var hasOverlap = await HasOverlapAsync(
                schedule.DoctorId,
                schedule.DayOfWeek,
                schedule.StartTime,
                schedule.EndTime,
                schedule.Id);

            if (hasOverlap)
            {
                throw new InvalidOperationException(
                    "The schedule overlaps with an existing active schedule.");
            }
        }
        else if (schedule.IsActive)
        {
            var proposed = ScheduleCoverage.From(schedule) with
            {
                IsActive = false
            };
            await EnsureFutureAppointmentsRemainCoveredAsync(schedule, proposed);
        }

        schedule.IsActive = request.IsActive;

        await _dbContext.SaveChangesAsync();
        await transaction.CommitAsync();

        return MapToResponse(schedule);
    }

    private async Task EnsureFutureAppointmentsRemainCoveredAsync(
        DoctorSchedule currentSchedule,
        ScheduleCoverage proposedSchedule)
    {
        if (!currentSchedule.IsActive)
            return;

        var localNow = HospitalClock.LocalNow;
        var today = DateOnly.FromDateTime(localNow);
        var now = TimeOnly.FromDateTime(localNow);

        var otherSchedules = await _dbContext.DoctorSchedules
            .AsNoTracking()
            .Where(x =>
                x.DoctorId == currentSchedule.DoctorId &&
                x.Id != currentSchedule.Id &&
                x.IsActive)
            .Select(x => new ScheduleCoverage(
                x.Id,
                x.DoctorId,
                x.DayOfWeek,
                x.StartTime,
                x.EndTime,
                x.SlotDurationMinutes,
                x.MaxPatients,
                x.IsActive))
            .ToListAsync();

        var appointments = await _dbContext.Appointments
            .AsNoTracking()
            .Where(x =>
                x.DoctorId == currentSchedule.DoctorId &&
                (x.AppointmentDate > today ||
                 (x.AppointmentDate == today && x.StartTime > now)) &&
                x.Status != AppointmentStatus.Completed &&
                x.Status != AppointmentStatus.Cancelled &&
                x.Status != AppointmentStatus.NoShow)
            .Select(x => new AppointmentCoverage(
                x.DoctorId,
                x.AppointmentDate,
                x.StartTime,
                x.EndTime,
                x.Status))
            .ToListAsync();

        if (!ScheduleAppointmentIntegrity.PreservesAffectedAppointments(
                ScheduleCoverage.From(currentSchedule),
                proposedSchedule,
                otherSchedules,
                appointments,
                localNow))
        {
            throw new ScheduleAppointmentConflictException();
        }
    }

    private static void ValidateSchedule(
        TimeOnly startTime,
        TimeOnly endTime,
        int slotDurationMinutes,
        int maxPatients)
    {
        if (startTime >= endTime)
        {
            throw new InvalidOperationException(
                "Start time must be earlier than end time.");
        }

        if (slotDurationMinutes <= 0)
        {
            throw new InvalidOperationException(
                "Slot duration must be greater than 0.");
        }

        if (maxPatients <= 0)
        {
            throw new InvalidOperationException(
                "Max patients must be greater than 0.");
        }

        var scheduleMinutes =
            (endTime.ToTimeSpan() -
             startTime.ToTimeSpan()).TotalMinutes;

        if (slotDurationMinutes > scheduleMinutes)
        {
            throw new InvalidOperationException(
                "Slot duration cannot exceed schedule duration.");
        }
    }

    private static void ValidateDoctorAvailability(Doctor doctor)
    {
        if (!doctor.IsActive)
        {
            throw new InvalidOperationException(
                "Doctor is inactive.");
        }

        if (!doctor.User.IsActive)
        {
            throw new InvalidOperationException(
                "Doctor account is inactive.");
        }

        if (!doctor.Department.IsActive)
        {
            throw new InvalidOperationException(
                "Doctor's department is inactive.");
        }
    }

    private async Task<bool> HasOverlapAsync(
        Guid doctorId,
        DayOfWeek dayOfWeek,
        TimeOnly startTime,
        TimeOnly endTime,
        Guid? excludeScheduleId = null)
    {
        var query = _dbContext.DoctorSchedules
            .AsNoTracking()
            .Where(x =>
                x.DoctorId == doctorId &&
                x.DayOfWeek == dayOfWeek &&
                x.IsActive);

        if (excludeScheduleId.HasValue)
        {
            query = query.Where(x =>
                x.Id != excludeScheduleId.Value);
        }

        return await query.AnyAsync(x =>
            startTime < x.EndTime &&
            endTime > x.StartTime);
    }

    private static DoctorScheduleResponse MapToResponse(
        DoctorSchedule schedule)
    {
        return new DoctorScheduleResponse
        {
            Id = schedule.Id,
            DoctorId = schedule.DoctorId,
            DoctorName = schedule.Doctor.FullName,
            DayOfWeek = schedule.DayOfWeek,
            StartTime = schedule.StartTime,
            EndTime = schedule.EndTime,
            SlotDurationMinutes = schedule.SlotDurationMinutes,
            MaxPatients = schedule.MaxPatients,
            IsActive = schedule.IsActive
        };
    }
}
