using System.Reflection;
using HIS.Api.Hubs;
using Microsoft.AspNetCore.SignalR;
using Microsoft.Extensions.Logging.Abstractions;

var repositoryRoot = Path.GetFullPath(args.Length == 1
    ? args[0]
    : Path.Combine(AppContext.BaseDirectory, "../../../../.."));
var queueServiceSource = File.ReadAllText(Path.Combine(repositoryRoot,
    "backend/HIS/HIS.Api/Services/QueueService.cs"));
var notifierSource = File.ReadAllText(Path.Combine(repositoryRoot,
    "backend/HIS/HIS.Api/Services/SignalRQueueNotifier.cs"));
var passed = 0;

void Check(bool condition, string name)
{
    if (!condition)
        throw new InvalidOperationException($"FAIL: {name}");
    passed++;
    Console.WriteLine($"PASS: {name}");
}

var groups = new FakeGroupManager();
var registry = new DoctorQueueConnectionRegistry(
    new FakeHubContext(groups),
    NullLogger<DoctorQueueConnectionRegistry>.Instance);
var doctorA = Guid.NewGuid();
var doctorB = Guid.NewGuid();
var deliveredA = 0;
var deliveredB = 0;

Check(await registry.TryRegisterAsync(doctorA, "a-1", _ => Task.FromResult(true),
    () => groups.AddToGroupAsync("a-1", $"doctor-user:{doctorA}"), default),
    "Active Doctor connection joins only its user-scoped group");
await registry.DeliverIfAuthorizedAsync(doctorA, _ => Task.FromResult(true),
    () => { deliveredA++; return Task.CompletedTask; });
Check(deliveredA == 1, "Active Doctor receives an authorized queue event");

Check(!await registry.TryRegisterAsync(Guid.NewGuid(), "inactive",
    _ => Task.FromResult(false), () => Task.CompletedTask, default),
    "Inactive Doctor cannot register a connection");
Check(!await registry.TryRegisterAsync(Guid.NewGuid(), "deleted",
    _ => Task.FromResult(false), () => Task.CompletedTask, default),
    "Deleted or unresolved User fails closed");
Check(!await registry.TryRegisterAsync(Guid.NewGuid(), "lookup-error",
    _ => Task.FromResult(false), () => Task.CompletedTask, default),
    "Account-state lookup failure fails closed");

Check(await registry.TryRegisterAsync(doctorA, "a-2", _ => Task.FromResult(true),
    () => groups.AddToGroupAsync("a-2", $"doctor-user:{doctorA}"), default),
    "Multiple tabs for one Doctor are tracked");
await registry.PersistStatusAndRevokeAsync(doctorA, false, () => Task.CompletedTask);
Check(groups.Removed.SetEquals(new[] { "a-1", "a-2" }),
    "Deactivation removes every tracked Doctor connection");
await registry.DeliverIfAuthorizedAsync(doctorA, _ => Task.FromResult(true),
    () => { deliveredA++; return Task.CompletedTask; });
Check(deliveredA == 1,
    "No patient-identifying event is delivered after effective revocation");
Check(!await registry.TryRegisterAsync(doctorA, "a-3", _ => Task.FromResult(true),
    () => Task.CompletedTask, default),
    "Reconnect remains rejected after deactivation");

Check(await registry.TryRegisterAsync(doctorB, "b-1", _ => Task.FromResult(true),
    () => groups.AddToGroupAsync("b-1", $"doctor-user:{doctorB}"), default),
    "Another active Doctor remains independently authorized");
await registry.DeliverIfAuthorizedAsync(doctorB, _ => Task.FromResult(true),
    () => { deliveredB++; return Task.CompletedTask; });
Check(deliveredB == 1, "Revoking Doctor A does not affect Doctor B");
await registry.UnregisterAsync(doctorB, "b-1");
groups.Removed.Clear();
await registry.PersistStatusAndRevokeAsync(doctorB, false, () => Task.CompletedTask);
Check(groups.Removed.Count == 0, "Disconnected clients are removed from tracking");

var raceDoctor = Guid.NewGuid();
var deliveryEntered = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
var releaseDelivery = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
var persisted = false;
var delivery = registry.DeliverIfAuthorizedAsync(raceDoctor,
    _ => Task.FromResult(true), async () =>
    {
        deliveryEntered.SetResult();
        await releaseDelivery.Task;
    });
await deliveryEntered.Task;
var revoke = registry.PersistStatusAndRevokeAsync(raceDoctor, false,
    () => { persisted = true; return Task.CompletedTask; });
await Task.Delay(20);
Check(!persisted, "Deactivation waits for an in-flight authorized delivery boundary");
releaseDelivery.SetResult();
await Task.WhenAll(delivery, revoke);
var postRaceDelivery = false;
await registry.DeliverIfAuthorizedAsync(raceDoctor, _ => Task.FromResult(true),
    () => { postRaceDelivery = true; return Task.CompletedTask; });
Check(!postRaceDelivery, "No delivery can cross the completed revocation boundary");

var publicHubMethods = typeof(QueueHub).GetMethods(
        BindingFlags.Instance | BindingFlags.Public | BindingFlags.DeclaredOnly)
    .Where(method => method.Name is not nameof(QueueHub.OnConnectedAsync)
        and not nameof(QueueHub.OnDisconnectedAsync))
    .ToArray();
Check(publicHubMethods.Length == 0,
    "QueueHub exposes no client-invokable queue methods");
Check(notifierSource.Contains("DeliverIfAuthorizedAsync", StringComparison.Ordinal) &&
      !notifierSource.Contains("Clients.All", StringComparison.Ordinal),
    "Sensitive Doctor delivery is guarded and never globally broadcast");
Check(queueServiceSource.Contains("QueueStatus.Waiting", StringComparison.Ordinal) &&
      queueServiceSource.Contains("QueueStatus.Called", StringComparison.Ordinal) &&
      queueServiceSource.Contains("QueueStatus.InService", StringComparison.Ordinal) &&
      queueServiceSource.Contains("QueueStatus.Completed", StringComparison.Ordinal),
    "Existing queue transition implementation remains present");

Console.WriteLine($"SignalR queue privacy checks: {passed}/{passed} PASS");

sealed class FakeHubContext(FakeGroupManager groups) : IHubContext<QueueHub>
{
    public IHubClients Clients { get; } = new FakeHubClients();
    public IGroupManager Groups { get; } = groups;
}

sealed class FakeGroupManager : IGroupManager
{
    public HashSet<string> Removed { get; } = [];
    public Task AddToGroupAsync(string connectionId, string groupName,
        CancellationToken cancellationToken = default) => Task.CompletedTask;
    public Task RemoveFromGroupAsync(string connectionId, string groupName,
        CancellationToken cancellationToken = default)
    {
        Removed.Add(connectionId);
        return Task.CompletedTask;
    }
}

sealed class FakeHubClients : IHubClients
{
    private static readonly IClientProxy Proxy = new FakeClientProxy();
    public IClientProxy All => Proxy;
    public IClientProxy AllExcept(IReadOnlyList<string> excludedConnectionIds) => Proxy;
    public IClientProxy Client(string connectionId) => Proxy;
    public IClientProxy Clients(IReadOnlyList<string> connectionIds) => Proxy;
    public IClientProxy Group(string groupName) => Proxy;
    public IClientProxy GroupExcept(string groupName, IReadOnlyList<string> excludedConnectionIds) => Proxy;
    public IClientProxy Groups(IReadOnlyList<string> groupNames) => Proxy;
    public IClientProxy User(string userId) => Proxy;
    public IClientProxy Users(IReadOnlyList<string> userIds) => Proxy;
}

sealed class FakeClientProxy : IClientProxy
{
    public Task SendCoreAsync(string method, object?[] args,
        CancellationToken cancellationToken = default) => Task.CompletedTask;
}
