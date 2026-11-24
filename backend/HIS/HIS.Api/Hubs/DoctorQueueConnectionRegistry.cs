using System.Collections.Concurrent;
using Microsoft.AspNetCore.SignalR;

namespace HIS.Api.Hubs;

public interface IDoctorQueueConnectionRegistry
{
    Task<bool> TryRegisterAsync(Guid userId, string connectionId,
        Func<CancellationToken, Task<bool>> authorize, Func<Task> addToGroup,
        CancellationToken cancellationToken);
    Task UnregisterAsync(Guid userId, string connectionId);
    Task DeliverIfAuthorizedAsync(Guid userId,
        Func<CancellationToken, Task<bool>> authorize, Func<Task> deliver,
        CancellationToken cancellationToken = default);
    Task PersistStatusAndRevokeAsync(Guid userId, bool isActive, Func<Task> persist);
}

public sealed class DoctorQueueConnectionRegistry(
    IHubContext<QueueHub> hubContext,
    ILogger<DoctorQueueConnectionRegistry> logger)
    : IDoctorQueueConnectionRegistry
{
    private sealed class DoctorConnections
    {
        public SemaphoreSlim Gate { get; } = new(1, 1);
        public HashSet<string> ConnectionIds { get; } = [];
        public bool Revoked { get; set; }
    }

    private readonly ConcurrentDictionary<Guid, DoctorConnections> _doctors = [];

    public async Task<bool> TryRegisterAsync(Guid userId, string connectionId,
        Func<CancellationToken, Task<bool>> authorize, Func<Task> addToGroup,
        CancellationToken cancellationToken)
    {
        var state = _doctors.GetOrAdd(userId, _ => new DoctorConnections());
        await state.Gate.WaitAsync(cancellationToken);
        try
        {
            if (state.Revoked || !await authorize(cancellationToken))
                return false;

            await addToGroup();
            state.ConnectionIds.Add(connectionId);
            return true;
        }
        finally
        {
            state.Gate.Release();
        }
    }

    public async Task UnregisterAsync(Guid userId, string connectionId)
    {
        if (!_doctors.TryGetValue(userId, out var state))
            return;

        await state.Gate.WaitAsync();
        try
        {
            state.ConnectionIds.Remove(connectionId);
        }
        finally
        {
            state.Gate.Release();
        }
    }

    public async Task DeliverIfAuthorizedAsync(Guid userId,
        Func<CancellationToken, Task<bool>> authorize, Func<Task> deliver,
        CancellationToken cancellationToken = default)
    {
        var state = _doctors.GetOrAdd(userId, _ => new DoctorConnections());
        await state.Gate.WaitAsync(cancellationToken);
        try
        {
            if (state.Revoked || !await authorize(cancellationToken))
                return;

            await deliver();
        }
        finally
        {
            state.Gate.Release();
        }
    }

    public async Task PersistStatusAndRevokeAsync(
        Guid userId, bool isActive, Func<Task> persist)
    {
        var state = _doctors.GetOrAdd(userId, _ => new DoctorConnections());
        await state.Gate.WaitAsync();
        try
        {
            await persist();
            state.Revoked = !isActive;

            if (isActive)
                return;

            var groupName = $"doctor-user:{userId}";
            foreach (var connectionId in state.ConnectionIds.ToArray())
            {
                try
                {
                    await hubContext.Groups.RemoveFromGroupAsync(connectionId, groupName);
                }
                catch (Exception error)
                {
                    logger.LogWarning(error,
                        "Could not remove a revoked Doctor connection from its queue group.");
                }
            }

            state.ConnectionIds.Clear();
        }
        finally
        {
            state.Gate.Release();
        }
    }
}
