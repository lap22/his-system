using HIS.Api.DTOs.Queue;
using HIS.Api.Hubs;
using Microsoft.AspNetCore.SignalR;

namespace HIS.Api.Services;

public class SignalRQueueNotifier : IQueueNotifier
{
    private readonly IHubContext<QueueHub> _hubContext;

    public SignalRQueueNotifier(
        IHubContext<QueueHub> hubContext)
    {
        _hubContext = hubContext;
    }

    public async Task NotifyQueueUpdatedAsync(
        Guid patientUserId,
        Guid doctorUserId,
        QueueEntryResponse queueEntry)

    {

        await _hubContext.Clients
            .Group($"patient:{patientUserId}")
            .SendAsync("QueueUpdated", queueEntry);

        await _hubContext.Clients
            .Group($"doctor-user:{doctorUserId}")
            .SendAsync("QueueUpdated", queueEntry);
    }
}