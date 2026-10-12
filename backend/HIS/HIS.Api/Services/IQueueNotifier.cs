using HIS.Api.DTOs.Queue;

namespace HIS.Api.Services;

public interface IQueueNotifier
{
    Task NotifyQueueUpdatedAsync(
        Guid patientUserId,
        Guid doctorUserId,
        QueueEntryResponse queueEntry);
}