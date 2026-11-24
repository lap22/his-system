using HIS.Api.Entities;
using HIS.Api.Enums;

namespace HIS.Api.Services;

public readonly record struct ScheduleCoverage(
    Guid Id,
    Guid DoctorId,
    DayOfWeek DayOfWeek,
    TimeOnly StartTime,
    TimeOnly EndTime,
    int SlotDurationMinutes,
    int MaxPatients,
    bool IsActive)
{
    public static ScheduleCoverage From(DoctorSchedule value) => new(
        value.Id,
        value.DoctorId,
        value.DayOfWeek,
        value.StartTime,
        value.EndTime,
        value.SlotDurationMinutes,
        value.MaxPatients,
        value.IsActive);
}

public readonly record struct AppointmentCoverage(
    Guid DoctorId,
    DateOnly Date,
    TimeOnly StartTime,
    TimeOnly EndTime,
    AppointmentStatus Status)
{
    public static AppointmentCoverage From(Appointment value) => new(
        value.DoctorId,
        value.AppointmentDate,
        value.StartTime,
        value.EndTime,
        value.Status);
}

public static class ScheduleAppointmentIntegrity
{
    public static bool IsFutureNonTerminal(
        AppointmentCoverage appointment,
        DateTime hospitalLocalNow)
    {
        if (appointment.Status is AppointmentStatus.Completed or
            AppointmentStatus.Cancelled or AppointmentStatus.NoShow)
        {
            return false;
        }

        var today = DateOnly.FromDateTime(hospitalLocalNow);
        return appointment.Date > today ||
            (appointment.Date == today &&
             appointment.StartTime > TimeOnly.FromDateTime(hospitalLocalNow));
    }

    public static bool Covers(
        ScheduleCoverage schedule,
        AppointmentCoverage appointment)
    {
        if (!schedule.IsActive ||
            schedule.DoctorId != appointment.DoctorId ||
            schedule.DayOfWeek != appointment.Date.DayOfWeek ||
            schedule.SlotDurationMinutes <= 0 ||
            schedule.MaxPatients <= 0 ||
            appointment.StartTime < schedule.StartTime ||
            appointment.EndTime > schedule.EndTime)
        {
            return false;
        }

        var offsetMinutes =
            (appointment.StartTime.ToTimeSpan() - schedule.StartTime.ToTimeSpan())
            .TotalMinutes;
        if (offsetMinutes < 0 ||
            offsetMinutes % schedule.SlotDurationMinutes != 0)
        {
            return false;
        }

        var slotIndex = (int)(offsetMinutes / schedule.SlotDurationMinutes);
        if (slotIndex >= schedule.MaxPatients)
        {
            return false;
        }

        var expectedEnd = appointment.StartTime.AddMinutes(
            schedule.SlotDurationMinutes);
        return expectedEnd == appointment.EndTime &&
            expectedEnd <= schedule.EndTime;
    }

    public static bool PreservesAffectedAppointments(
        ScheduleCoverage current,
        ScheduleCoverage proposed,
        IReadOnlyCollection<ScheduleCoverage> otherSchedules,
        IReadOnlyCollection<AppointmentCoverage> appointments,
        DateTime hospitalLocalNow)
    {
        var candidates = otherSchedules
            .Where(x => x.Id != current.Id && x.IsActive)
            .Append(proposed)
            .Where(x => x.IsActive)
            .ToArray();

        return appointments
            .Where(x => IsFutureNonTerminal(x, hospitalLocalNow))
            .Where(x => Covers(current, x))
            .All(appointment => candidates.Any(schedule =>
                Covers(schedule, appointment)));
    }
}
