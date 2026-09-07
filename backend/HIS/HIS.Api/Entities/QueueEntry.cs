using HIS.Api.Enums;

namespace HIS.Api.Entities;

public class QueueEntry
{
    public Guid Id { get; set; } = Guid.NewGuid();

    public Guid AppointmentId { get; set; }

    public int QueueNumber { get; set; }

    public QueueStatus Status { get; set; }
        = QueueStatus.Waiting;

    public DateTime CheckedInAt { get; set; } = DateTime.UtcNow;

    public DateTime? CalledAt { get; set; }

    public DateTime? StartedAt { get; set; }

    public DateTime? CompletedAt { get; set; }

    public Appointment Appointment { get; set; } = null!;
}