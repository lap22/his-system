namespace HIS.Api.DTOs.DoctorSchedules;

public class DoctorScheduleResponse
{
    public Guid Id { get; set; }

    public Guid DoctorId { get; set; }

    public string DoctorName { get; set; } = null!;

    public DayOfWeek DayOfWeek { get; set; }

    public TimeOnly StartTime { get; set; }

    public TimeOnly EndTime { get; set; }

    public int SlotDurationMinutes { get; set; }

    public int MaxPatients { get; set; }

    public bool IsActive { get; set; }
}