using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;

namespace HIS.Api.Hubs;

[Authorize(Roles = "Patient,Doctor")]
public class QueueHub : Hub
{
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
            await Groups.AddToGroupAsync(
                Context.ConnectionId,
                $"doctor-user:{userId}");
        }

        await base.OnConnectedAsync();
    }
}