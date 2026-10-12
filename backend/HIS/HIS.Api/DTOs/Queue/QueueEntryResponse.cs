using HIS.Api.Enums;

namespace HIS.Api.DTOs.Queue;

public class QueueEntryResponse
{
    public Guid Id { get; set; }

    public Guid AppointmentId { get; set; }

    public int QueueNumber { get; set; }

    public QueueStatus Status { get; set; }

    public Guid PatientProfileId { get; set; }

    public string PatientName { get; set; } = null!;

    public Guid DoctorId { get; set; }

    public string DoctorName { get; set; } = null!;

    public DateOnly AppointmentDate { get; set; }

    public TimeOnly AppointmentTime { get; set; }

    public DateTime CheckedInAt { get; set; }

    public DateTime? CalledAt { get; set; }

    public DateTime? StartedAt { get; set; }

    public DateTime? CompletedAt { get; set; }
}