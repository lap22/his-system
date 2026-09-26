using System.ComponentModel.DataAnnotations;

namespace HIS.Api.DTOs.DoctorSchedules;

public class CreateDoctorScheduleRequest
{
    [Required]
    public Guid DoctorId { get; set; }

    [Required]
    public DayOfWeek DayOfWeek { get; set; }

    [Required]
    public TimeOnly StartTime { get; set; }

    [Required]
    public TimeOnly EndTime { get; set; }

    [Range(1, 480)]
    public int SlotDurationMinutes { get; set; } = 30;

    [Range(1, 100)]
    public int MaxPatients { get; set; }
}