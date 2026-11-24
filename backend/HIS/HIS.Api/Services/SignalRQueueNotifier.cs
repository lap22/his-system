using HIS.Api.DTOs.Queue;
using HIS.Api.Hubs;
using HIS.Api.Security;
using Microsoft.AspNetCore.SignalR;

namespace HIS.Api.Services;

public class SignalRQueueNotifier : IQueueNotifier
{
    private readonly IHubContext<QueueHub> _hubContext;
    private readonly IDoctorQueueConnectionRegistry _connections;
    private readonly IDoctorQueueAuthorizationReader _doctorAuthorization;

    public SignalRQueueNotifier(
        IHubContext<QueueHub> hubContext,
        IDoctorQueueConnectionRegistry connections,
        IDoctorQueueAuthorizationReader doctorAuthorization)
    {
        _hubContext = hubContext;
        _connections = connections;
        _doctorAuthorization = doctorAuthorization;
    }

    public async Task NotifyQueueUpdatedAsync(
        Guid patientUserId,
        Guid doctorUserId,
        QueueEntryResponse queueEntry)

    {

        await _hubContext.Clients
            .Group($"patient:{patientUserId}")
            .SendAsync("QueueUpdated", queueEntry);

        await _connections.DeliverIfAuthorizedAsync(
            doctorUserId,
            cancellationToken => _doctorAuthorization.IsAuthorizedAsync(
                doctorUserId, cancellationToken),
            () => _hubContext.Clients
                .Group($"doctor-user:{doctorUserId}")
                .SendAsync("QueueUpdated", queueEntry));
    }
}
