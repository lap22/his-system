using System.Security.Claims;
using HIS.Api.Security;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;

namespace HIS.Api.Hubs;

[Authorize(Roles = "Patient,Doctor")]
public class QueueHub : Hub
{
    private readonly IDoctorQueueConnectionRegistry _connections;
    private readonly IDoctorQueueAuthorizationReader _doctorAuthorization;

    public QueueHub(
        IDoctorQueueConnectionRegistry connections,
        IDoctorQueueAuthorizationReader doctorAuthorization)
    {
        _connections = connections;
        _doctorAuthorization = doctorAuthorization;
    }

    public override async Task OnConnectedAsync()
    {
        var userIdValue = Context.User?
            .FindFirstValue(ClaimTypes.NameIdentifier);

        if (!Guid.TryParse(userIdValue, out var userId))
        {
            Context.Abort();
            return;
        }

        var role = Context.User?
            .FindFirstValue(ClaimTypes.Role);

        if (role == "Patient")
        {
            await Groups.AddToGroupAsync(
                Context.ConnectionId,
                $"patient:{userId}");
        }
        else if (role == "Doctor")
        {
            var registered = await _connections.TryRegisterAsync(
                userId,
                Context.ConnectionId,
                cancellationToken => _doctorAuthorization.IsAuthorizedAsync(
                    userId, cancellationToken),
                () => Groups.AddToGroupAsync(
                    Context.ConnectionId,
                    $"doctor-user:{userId}"),
                Context.ConnectionAborted);

            if (!registered)
            {
                Context.Abort();
                return;
            }
        }

        await base.OnConnectedAsync();
    }

    public override async Task OnDisconnectedAsync(Exception? exception)
    {
        var userIdValue = Context.User?
            .FindFirstValue(ClaimTypes.NameIdentifier);
        var role = Context.User?
            .FindFirstValue(ClaimTypes.Role);

        if (role == "Doctor" && Guid.TryParse(userIdValue, out var userId))
        {
            await _connections.UnregisterAsync(userId, Context.ConnectionId);
        }

        await base.OnDisconnectedAsync(exception);
    }
}
