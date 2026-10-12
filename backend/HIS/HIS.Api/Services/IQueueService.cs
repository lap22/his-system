using HIS.Api.DTOs.Queue;

namespace HIS.Api.Services;

public interface IQueueService
{
    Task<QueueEntryResponse> CheckInAsync(
        Guid currentUserId,
        Guid appointmentId);

    Task<List<QueueEntryResponse>> GetMyQueueAsync(
        Guid currentUserId);

    Task<List<QueueEntryResponse>> GetDoctorQueueAsync(
        Guid currentUserId,
        DateOnly? date);

    Task<QueueEntryResponse?> CallAsync(
        Guid currentUserId,
        Guid queueEntryId);

    Task<QueueEntryResponse?> StartAsync(
        Guid currentUserId,
        Guid queueEntryId);

    Task<QueueEntryResponse?> CompleteAsync(
        Guid currentUserId,
        Guid queueEntryId);
}