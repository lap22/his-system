using HIS.Api.Enums;

namespace HIS.Api.DTOs.Appointments;

public class AppointmentResponse
{
    public Guid Id { get; set; }

    public Guid PatientProfileId { get; set; }
    public string PatientName { get; set; } = null!;

    public Guid DoctorId { get; set; }
    public string DoctorName { get; set; } = null!;

    public Guid DepartmentId { get; set; }
    public string DepartmentName { get; set; } = null!;

    public DateOnly AppointmentDate { get; set; }

    public TimeOnly StartTime { get; set; }

    public TimeOnly EndTime { get; set; }

    public string? Symptoms { get; set; }

    public AppointmentStatus Status { get; set; }

    public DateTime CreatedAt { get; set; }

    public DateTime? UpdatedAt { get; set; }

    public DateTime? CancelledAt { get; set; }

    public string? CancellationReason { get; set; }
}