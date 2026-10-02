using HIS.Api.Data;
using HIS.Api.DTOs.Appointments;
using HIS.Api.Entities;
using HIS.Api.Enums;
using Microsoft.EntityFrameworkCore;

namespace HIS.Api.Services;

public class AppointmentService : IAppointmentService
{
    private readonly AppDbContext _dbContext;

    public AppointmentService(AppDbContext dbContext)
    {
        _dbContext = dbContext;
    }

    // Implement các method ở các bước tiếp theo
    public async Task<List<AvailableSlotResponse>> GetAvailableSlotsAsync(
    Guid doctorId,
    DateOnly date)
    {
        if (doctorId == Guid.Empty)
            throw new InvalidOperationException("DoctorId is required.");

        var today = DateOnly.FromDateTime(DateTime.Now);

        if (date < today)
            throw new InvalidOperationException(
                "Cannot get available slots for a past date.");

        var doctor = await _dbContext.Doctors
            .AsNoTracking()
            .Include(x => x.User)
            .Include(x => x.Department)
            .FirstOrDefaultAsync(x => x.Id == doctorId);

        if (doctor is null)
            throw new KeyNotFoundException("Doctor not found.");

        if (!doctor.IsActive ||
            !doctor.User.IsActive ||
            !doctor.Department.IsActive)
        {
            throw new InvalidOperationException(
                "Doctor is currently unavailable.");
        }

        var schedules = await _dbContext.DoctorSchedules
            .AsNoTracking()
            .Where(x =>
                x.DoctorId == doctorId &&
                x.DayOfWeek == date.DayOfWeek &&
                x.IsActive)
            .OrderBy(x => x.StartTime)
            .ToListAsync();

        if (schedules.Count == 0)
            return new List<AvailableSlotResponse>();

        var bookedStartTimes = await _dbContext.Appointments
            .AsNoTracking()
            .Where(x =>
                x.DoctorId == doctorId &&
                x.AppointmentDate == date &&
                x.Status != AppointmentStatus.Cancelled)
            .Select(x => x.StartTime)
            .ToListAsync();

        var bookedSet = bookedStartTimes.ToHashSet();

        var slots = new List<AvailableSlotResponse>();

        foreach (var schedule in schedules)
        {
            var generatedSlots = GenerateSlots(schedule);

            foreach (var slot in generatedSlots)
            {
                if (bookedSet.Contains(slot.StartTime))
                    continue;

                if (date == today)
                {
                    var now = TimeOnly.FromDateTime(DateTime.Now);

                    if (slot.StartTime <= now)
                        continue;
                }

                slots.Add(slot);
            }
        }

        return slots
            .OrderBy(x => x.StartTime)
            .ToList();
    }
    private static List<AvailableSlotResponse> GenerateSlots(
    DoctorSchedule schedule)
    {
        var slots = new List<AvailableSlotResponse>();

        var current = schedule.StartTime;

        while (slots.Count < schedule.MaxPatients)
        {
            var slotEnd = current.AddMinutes(
                schedule.SlotDurationMinutes);

            if (slotEnd > schedule.EndTime)
                break;

            slots.Add(new AvailableSlotResponse
            {
                StartTime = current,
                EndTime = slotEnd
            });

            current = slotEnd;
        }

        return slots;
    }
    private async Task<AvailableSlotResponse?> FindValidSlotAsync(
    Guid doctorId,
    DateOnly date,
    TimeOnly startTime)
    {
        var schedules = await _dbContext.DoctorSchedules
            .AsNoTracking()
            .Where(x =>
                x.DoctorId == doctorId &&
                x.DayOfWeek == date.DayOfWeek &&
                x.IsActive)
            .OrderBy(x => x.StartTime)
            .ToListAsync();

        foreach (var schedule in schedules)
        {
            var slots = GenerateSlots(schedule);

            var matchedSlot = slots.FirstOrDefault(
                x => x.StartTime == startTime);

            if (matchedSlot is not null)
                return matchedSlot;
        }

        return null;
    }
    public async Task<AppointmentResponse> CreateAsync(
    Guid currentUserId,
    CreateAppointmentRequest request)
    {
        if (currentUserId == Guid.Empty)
            throw new UnauthorizedAccessException();

        if (request.PatientProfileId == Guid.Empty)
            throw new InvalidOperationException(
                "PatientProfileId is required.");

        if (request.DoctorId == Guid.Empty)
            throw new InvalidOperationException(
                "DoctorId is required.");

        var today = DateOnly.FromDateTime(DateTime.Now);

        if (request.AppointmentDate < today)
            throw new InvalidOperationException(
                "Cannot book an appointment in the past.");

        // 1. Ownership
        var patientProfile = await _dbContext.PatientProfiles
            .AsNoTracking()
            .FirstOrDefaultAsync(x =>
                x.Id == request.PatientProfileId &&
                x.UserId == currentUserId);

        if (patientProfile is null)
            throw new KeyNotFoundException(
                "Patient profile not found.");

        // 2. Doctor availability
        var doctor = await _dbContext.Doctors
            .Include(x => x.User)
            .Include(x => x.Department)
            .FirstOrDefaultAsync(x =>
                x.Id == request.DoctorId);

        if (doctor is null)
            throw new KeyNotFoundException("Doctor not found.");

        if (!doctor.IsActive ||
            !doctor.User.IsActive ||
            !doctor.Department.IsActive)
        {
            throw new InvalidOperationException(
                "Doctor is currently unavailable.");
        }

        // 3. StartTime phải nằm đúng slot grid
        var validSlot = await FindValidSlotAsync(
            request.DoctorId,
            request.AppointmentDate,
            request.StartTime);

        if (validSlot is null)
            throw new InvalidOperationException(
                "The selected appointment slot is invalid.");

        // 4. Không đặt slot đã qua trong ngày hôm nay
        if (request.AppointmentDate == today)
        {
            var now = TimeOnly.FromDateTime(DateTime.Now);

            if (request.StartTime <= now)
                throw new InvalidOperationException(
                    "Cannot book a past appointment slot.");
        }

        // 5. Kiểm tra double booking ở application layer
        var alreadyBooked = await _dbContext.Appointments
            .AnyAsync(x =>
                x.DoctorId == request.DoctorId &&
                x.AppointmentDate == request.AppointmentDate &&
                x.StartTime == request.StartTime &&
                x.Status != AppointmentStatus.Cancelled);

        if (alreadyBooked)
            throw new InvalidOperationException(
                "The selected appointment slot is no longer available.");

        var appointment = new Appointment
        {
            PatientProfileId = request.PatientProfileId,
            DoctorId = request.DoctorId,
            AppointmentDate = request.AppointmentDate,

            StartTime = validSlot.StartTime,

            // Frontend không quyết định EndTime
            EndTime = validSlot.EndTime,

            Symptoms = string.IsNullOrWhiteSpace(request.Symptoms)
                ? null
                : request.Symptoms.Trim(),

            Status = AppointmentStatus.Pending,

            CreatedAt = DateTime.UtcNow
        };

        _dbContext.Appointments.Add(appointment);

        try
        {
            await _dbContext.SaveChangesAsync();
        }
        catch (DbUpdateException)
        {
            // Database unique index là lớp bảo vệ cuối cùng
            throw new InvalidOperationException(
                "The selected appointment slot is no longer available.");
        }

        return MapToResponse(
            appointment,
            patientProfile.FullName,
            doctor);
    }
    private static AppointmentResponse MapToResponse(
    Appointment appointment,
    string patientName,
    Doctor doctor)
    {
        return new AppointmentResponse
        {
            Id = appointment.Id,

            PatientProfileId = appointment.PatientProfileId,
            PatientName = patientName,

            DoctorId = appointment.DoctorId,
            DoctorName = doctor.FullName,

            DepartmentId = doctor.DepartmentId,
            DepartmentName = doctor.Department.Name,

            AppointmentDate = appointment.AppointmentDate,
            StartTime = appointment.StartTime,
            EndTime = appointment.EndTime,

            Symptoms = appointment.Symptoms,
            Status = appointment.Status,

            CreatedAt = appointment.CreatedAt,
            UpdatedAt = appointment.UpdatedAt,

            CancelledAt = appointment.CancelledAt,
            CancellationReason = appointment.CancellationReason
        };
    }
    public async Task<List<AppointmentResponse>> GetMyAppointmentsAsync(
    Guid currentUserId)
    {
        var appointments = await _dbContext.Appointments
            .AsNoTracking()
            .Include(x => x.PatientProfile)
            .Include(x => x.Doctor)
                .ThenInclude(x => x.Department)
            .Where(x =>
                x.PatientProfile.UserId == currentUserId)
            .OrderByDescending(x => x.AppointmentDate)
            .ThenByDescending(x => x.StartTime)
            .ToListAsync();

        return appointments
            .Select(x => MapToResponse(
                x,
                x.PatientProfile.FullName,
                x.Doctor))
            .ToList();
    }
    public async Task<AppointmentResponse?> CancelAsync(
    Guid currentUserId,
    Guid appointmentId,
    CancelAppointmentRequest request)
    {
        var appointment = await _dbContext.Appointments
            .Include(x => x.PatientProfile)
            .Include(x => x.Doctor)
                .ThenInclude(x => x.Department)
            .FirstOrDefaultAsync(x =>
                x.Id == appointmentId &&
                x.PatientProfile.UserId == currentUserId);

        if (appointment is null)
            return null;

        if (appointment.Status == AppointmentStatus.Cancelled)
            throw new InvalidOperationException(
                "Appointment is already cancelled.");

        if (appointment.Status != AppointmentStatus.Pending &&
            appointment.Status != AppointmentStatus.Confirmed)
        {
            throw new InvalidOperationException(
                "This appointment can no longer be cancelled.");
        }

        appointment.Status = AppointmentStatus.Cancelled;

        appointment.CancelledAt = DateTime.UtcNow;

        appointment.CancellationReason =
            string.IsNullOrWhiteSpace(request.Reason)
                ? null
                : request.Reason.Trim();

        appointment.UpdatedAt = DateTime.UtcNow;

        await _dbContext.SaveChangesAsync();

        return MapToResponse(
            appointment,
            appointment.PatientProfile.FullName,
            appointment.Doctor);
    }
    public async Task<AppointmentResponse?> GetByIdAsync(
    Guid currentUserId,
    Guid appointmentId,
    string currentUserRole)
    {
        var query = _dbContext.Appointments
            .AsNoTracking()
            .Include(x => x.PatientProfile)
            .Include(x => x.Doctor)
                .ThenInclude(x => x.Department)
            .AsQueryable();

        if (currentUserRole == UserRole.Patient.ToString())
        {
            query = query.Where(x =>
                x.PatientProfile.UserId == currentUserId);
        }
        else if (currentUserRole == UserRole.Doctor.ToString())
        {
            query = query.Where(x =>
                x.Doctor.UserId == currentUserId);
        }
        else if (currentUserRole != UserRole.Admin.ToString())
        {
            throw new UnauthorizedAccessException();
        }

        var appointment = await query
            .FirstOrDefaultAsync(x => x.Id == appointmentId);

        if (appointment is null)
            return null;

        return MapToResponse(
            appointment,
            appointment.PatientProfile.FullName,
            appointment.Doctor);
    }
    public async Task<List<AppointmentResponse>> GetDoctorAppointmentsAsync(
    Guid currentUserId,
    DateOnly? date,
    AppointmentStatus? status)
    {
        var doctor = await _dbContext.Doctors
            .AsNoTracking()
            .FirstOrDefaultAsync(x =>
                x.UserId == currentUserId);

        if (doctor is null)
            throw new KeyNotFoundException(
                "Doctor profile not found.");

        var query = _dbContext.Appointments
            .AsNoTracking()
            .Include(x => x.PatientProfile)
            .Include(x => x.Doctor)
                .ThenInclude(x => x.Department)
            .Where(x => x.DoctorId == doctor.Id);

        if (date.HasValue)
        {
            query = query.Where(x =>
                x.AppointmentDate == date.Value);
        }

        if (status.HasValue)
        {
            query = query.Where(x =>
                x.Status == status.Value);
        }

        var appointments = await query
            .OrderBy(x => x.AppointmentDate)
            .ThenBy(x => x.StartTime)
            .ToListAsync();

        return appointments
            .Select(x => MapToResponse(
                x,
                x.PatientProfile.FullName,
                x.Doctor))
            .ToList();
    }
    public async Task<AppointmentResponse?> ConfirmAsync(
    Guid currentUserId,
    Guid appointmentId,
    string currentUserRole)
    {
        var query = _dbContext.Appointments
            .Include(x => x.PatientProfile)
            .Include(x => x.Doctor)
                .ThenInclude(x => x.Department)
            .AsQueryable();

        if (currentUserRole == UserRole.Doctor.ToString())
        {
            query = query.Where(x =>
                x.Doctor.UserId == currentUserId);
        }
        else if (currentUserRole != UserRole.Admin.ToString())
        {
            throw new UnauthorizedAccessException();
        }

        var appointment = await query
            .FirstOrDefaultAsync(x =>
                x.Id == appointmentId);

        if (appointment is null)
            return null;

        if (appointment.Status != AppointmentStatus.Pending)
        {
            throw new InvalidOperationException(
                "Only pending appointments can be confirmed.");
        }

        appointment.Status = AppointmentStatus.Confirmed;
        appointment.UpdatedAt = DateTime.UtcNow;

        await _dbContext.SaveChangesAsync();

        return MapToResponse(
            appointment,
            appointment.PatientProfile.FullName,
            appointment.Doctor);
    }
}

