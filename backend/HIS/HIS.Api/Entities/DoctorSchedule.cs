namespace HIS.Api.Entities;

public class DoctorSchedule
{
    public Guid Id { get; set; } = Guid.NewGuid();

    public Guid DoctorId { get; set; }

    public DayOfWeek DayOfWeek { get; set; }

    public TimeOnly StartTime { get; set; }

    public TimeOnly EndTime { get; set; }

    public int SlotDurationMinutes { get; set; } = 30;

    public int MaxPatients { get; set; }

    public bool IsActive { get; set; } = true;

    public Doctor Doctor { get; set; } = null!;
}