using HIS.Api.Enums;

namespace HIS.Api.Entities;

public class Appointment
{
    public Guid Id { get; set; } = Guid.NewGuid();

    public Guid PatientProfileId { get; set; }

    public Guid DoctorId { get; set; }

    public DateOnly AppointmentDate { get; set; }

    public TimeOnly StartTime { get; set; }

    public TimeOnly EndTime { get; set; }

    public string? Symptoms { get; set; }

    public AppointmentStatus Status { get; set; }
        = AppointmentStatus.Pending;

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public DateTime? UpdatedAt { get; set; }

    public DateTime? CancelledAt { get; set; }

    public string? CancellationReason { get; set; }

    public PatientProfile PatientProfile { get; set; } = null!;

    public Doctor Doctor { get; set; } = null!;

    public QueueEntry? QueueEntry { get; set; }

    public MedicalRecord? MedicalRecord { get; set; }
}