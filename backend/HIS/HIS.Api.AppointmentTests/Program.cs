using System.Data.Common;
using System.Text.Json;
using System.Text.Json.Serialization;
using HIS.Api.Data;
using HIS.Api.DTOs.Appointments;
using HIS.Api.DTOs.Queue;
using HIS.Api.Entities;
using HIS.Api.Enums;
using HIS.Api.Helpers;
using HIS.Api.Services;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;

if (args is ["--clinical-model"])
{
    try { ClinicalModelChecks.Run(); }
    catch (Exception error)
    {
        Console.Error.WriteLine(error.Message);
        Environment.ExitCode = 1;
    }
    return;
}

if (args.FirstOrDefault() == "--cancellation-concurrency")
{
    if (args.Length != 2 || args[1] is not ("--preflight" or "--execute"))
        throw new ArgumentException("Specify --cancellation-concurrency --preflight or --execute.");
    await CancellationConcurrencyChecks.RunAsync(args[1] == "--execute");
    return;
}

var apiDirectory = Path.GetFullPath(args.Length > 0 ? args[0] : "backend/HIS/HIS.Api");
var configuration = new ConfigurationBuilder().SetBasePath(apiDirectory)
    .AddJsonFile("appsettings.json").AddJsonFile("appsettings.Development.json", optional: true)
    .AddEnvironmentVariables().Build();
var connectionString = configuration.GetConnectionString("DefaultConnection");
DbContextOptions<AppDbContext> Options(params IInterceptor[] interceptors) =>
    new DbContextOptionsBuilder<AppDbContext>().UseSqlServer(connectionString)
        .AddInterceptors(interceptors).Options;
await using var db = new AppDbContext(Options());
var suffix = Guid.NewGuid().ToString("N");
var patient = new User { Email = $"slot-patient-{suffix}@example.invalid", PasswordHash = "test-only", Role = UserRole.Patient };
var doctorUser = new User { Email = $"slot-doctor-{suffix}@example.invalid", PasswordHash = "test-only", Role = UserRole.Doctor };
var department = new Department { Name = $"Slot test {suffix}" };
var doctor = new Doctor { User = doctorUser, Department = department, FullName = "Slot test doctor", Specialization = "Test", LicenseNumber = suffix };
var profile = new PatientProfile { User = patient, FullName = "Slot test patient", Gender = "Other", DateOfBirth = new DateOnly(2000, 1, 1), Relationship = RelationshipType.Self, IsDefault = true };
var today = HospitalClock.Today;
var future = today.AddDays(7);
var schedule = new DoctorSchedule { Doctor = doctor, DayOfWeek = future.DayOfWeek, StartTime = new TimeOnly(9, 0), EndTime = new TimeOnly(12, 0), SlotDurationMinutes = 30, MaxPatients = 4 };
int passed = 0;
void Check(bool condition, string name)
{
    if (!condition) throw new Exception($"FAIL: {name}");
    passed++;
    Console.WriteLine($"PASS: {name}");
}
CreateAppointmentRequest Request(DateOnly date, TimeOnly start) => new()
{
    PatientProfileId = profile.Id, DoctorId = doctor.Id, AppointmentDate = date, StartTime = start
};
async Task<List<AvailableSlotResponse>> Slots(DateOnly date)
{
    await using var context = new AppDbContext(Options());
    return await new AppointmentService(context).GetAvailableSlotsAsync(doctor.Id, date);
}
async Task<AppointmentResponse> Book(DateOnly date, TimeOnly start, Guid? userId = null)
{
    await using var context = new AppDbContext(Options());
    return await new AppointmentService(context).CreateAsync(userId ?? patient.Id, Request(date, start));
}
async Task Reject(DateOnly date, TimeOnly start, string expected, string name)
{
    try { await Book(date, start); }
    catch (InvalidOperationException ex) when (ex.Message == expected) { Check(true, name); return; }
    throw new Exception($"FAIL: {name}");
}
async Task<Appointment> Seed(DateOnly date, TimeOnly start, TimeOnly end, AppointmentStatus status)
{
    var appointment = new Appointment { DoctorId = doctor.Id, PatientProfileId = profile.Id, AppointmentDate = date, StartTime = start, EndTime = end, Status = status };
    db.Appointments.Add(appointment);
    await db.SaveChangesAsync();
    return appointment;
}

try
{
    db.AddRange(profile, schedule);
    await db.SaveChangesAsync();
    var utcBefore = DateTime.UtcNow;
    var hospitalNow = HospitalClock.LocalNow;
    var utcAfter = DateTime.UtcNow;
    Check(hospitalNow >= utcBefore.AddHours(7) && hospitalNow <= utcAfter.AddHours(7), "Hospital snapshot uses Asia/Ho_Chi_Minh (UTC+7)");
    var available = await Slots(future);
    Check(available.Count == 4 && available.All(x => x.IsAvailable && x.Reason == SlotAvailabilityReason.Available), "Future slots available; MaxPatients still caps generated slots at four");
    var booked = await Book(future, new TimeOnly(9, 0));
    Check(booked.Status == AppointmentStatus.Pending && booked.EndTime == new TimeOnly(9, 30), "Future booking succeeds and backend calculates end time");
    await Reject(future, new TimeOnly(11, 0), "The selected appointment slot is invalid.", "MaxPatients-truncated interval cannot be booked");
    try { await Book(future.AddDays(7), new TimeOnly(9, 0), Guid.NewGuid()); throw new Exception("Ownership validation was bypassed"); }
    catch (KeyNotFoundException) { Check(true, "Patient profile ownership remains enforced"); }

    var exactDate = future.AddDays(7);
    var exact = await Seed(exactDate, new TimeOnly(9, 0), new TimeOnly(9, 30), AppointmentStatus.Completed);
    var exactSlots = await Slots(exactDate);
    Check(!exactSlots[0].IsAvailable && exactSlots[0].Reason == SlotAvailabilityReason.Completed && exactSlots[1].IsAvailable, "Completed exact match blocked; touching boundary remains available");
    await Reject(exactDate, new TimeOnly(9, 0), "The selected appointment slot is no longer available.", "Booking into Completed exact match rejected");

    var partialDate = future.AddDays(14);
    var partial = await Seed(partialDate, new TimeOnly(9, 15), new TimeOnly(9, 45), AppointmentStatus.Completed);
    var partialSlots = await Slots(partialDate);
    Check(partialSlots.Take(2).All(x => !x.IsAvailable && x.Reason == SlotAvailabilityReason.Completed) && partialSlots[2].IsAvailable, "Completed partial overlap blocks both intersecting slots");
    await Reject(partialDate, new TimeOnly(9, 0), "The selected appointment slot is no longer available.", "Booking partially overlapping Completed rejected (earlier start)");
    await Reject(partialDate, new TimeOnly(9, 30), "The selected appointment slot is no longer available.", "Booking partially overlapping Completed rejected (later start)");

    var cancelledDate = future.AddDays(21);
    var cancelled = await Seed(cancelledDate, new TimeOnly(9, 0), new TimeOnly(9, 30), AppointmentStatus.Cancelled);
    Check((await Slots(cancelledDate))[0].IsAvailable, "Cancelled appointment does not block availability");
    await Book(cancelledDate, new TimeOnly(9, 0));
    Check(await db.Appointments.AsNoTracking().AnyAsync(x => x.Id == cancelled.Id && x.Status == AppointmentStatus.Cancelled), "Cancelled slot can be rebooked without modifying cancelled history");

    var blockingStatuses = new[] { AppointmentStatus.Pending, AppointmentStatus.Confirmed, AppointmentStatus.CheckedIn, AppointmentStatus.InProgress, AppointmentStatus.NoShow };
    for (var index = 0; index < blockingStatuses.Length; index++)
    {
        var date = future.AddDays(7 * (4 + index));
        await Seed(date, new TimeOnly(9, 15), new TimeOnly(9, 45), blockingStatuses[index]);
        Check((await Slots(date)).Take(2).All(x => !x.IsAvailable && x.Reason == SlotAvailabilityReason.Full), $"{blockingStatuses[index]} overlap remains Full");
        await Reject(date, new TimeOnly(9, 0), "The selected appointment slot is no longer available.", $"{blockingStatuses[index]} overlap cannot be booked");
    }

    var pastDate = today.AddDays(-7);
    Check((await Slots(pastDate)).All(x => !x.IsAvailable && x.Reason == SlotAvailabilityReason.Past), "Past date returns unavailable candidates");
    await Reject(pastDate, new TimeOnly(9, 0), "Cannot book an appointment in the past.", "Past date booking rejected");
    var midnight = new DoctorSchedule { DoctorId = doctor.Id, DayOfWeek = today.DayOfWeek, StartTime = TimeOnly.MinValue, EndTime = new TimeOnly(0, 30), SlotDurationMinutes = 30, MaxPatients = 1 };
    db.DoctorSchedules.Add(midnight);
    await db.SaveChangesAsync();
    Check((await Slots(today)).Single(x => x.StartTime == TimeOnly.MinValue).Reason == SlotAvailabilityReason.Past, "Elapsed time today uses hospital-local snapshot");
    await Reject(today, TimeOnly.MinValue, "Cannot book a past appointment slot.", "Elapsed time today cannot be booked");

    schedule.IsActive = false;
    await db.SaveChangesAsync();
    Check((await Slots(future)).Where(x => x.StartTime >= new TimeOnly(9, 0)).All(x => x.Reason == SlotAvailabilityReason.Inactive && !x.IsAvailable), "Inactive schedule candidates disabled");
    await Reject(future, new TimeOnly(9, 30), "The selected appointment slot is invalid.", "Inactive schedule booking rejected");
    schedule.IsActive = true;
    doctor.IsActive = false;
    await db.SaveChangesAsync();
    Check((await Slots(future)).All(x => x.Reason == SlotAvailabilityReason.Inactive), "Inactive doctor candidates disabled");
    await Reject(future, new TimeOnly(9, 30), "Doctor is currently unavailable.", "Inactive doctor booking rejected");
    doctor.IsActive = true;
    doctorUser.IsActive = false;
    await db.SaveChangesAsync();
    Check((await Slots(future)).All(x => !x.IsAvailable), "Inactive doctor account disabled");
    doctorUser.IsActive = true;
    department.IsActive = false;
    await db.SaveChangesAsync();
    Check((await Slots(future)).All(x => !x.IsAvailable), "Inactive department disabled");
    department.IsActive = true;
    await db.SaveChangesAsync();

    // Overlapping legacy schedule grids exercise different-start concurrent requests.
    var shifted = new DoctorSchedule { DoctorId = doctor.Id, DayOfWeek = future.DayOfWeek, StartTime = new TimeOnly(9, 15), EndTime = new TimeOnly(9, 45), SlotDurationMinutes = 30, MaxPatients = 1 };
    db.DoctorSchedules.Add(shifted);
    await db.SaveChangesAsync();
    var concurrentDate = future.AddDays(7 * 20);
    var hold = new HoldBookingInterceptor();
    var secondAttempt = new LockAttemptInterceptor();
    var readAttempt = new LockAttemptInterceptor();
    async Task<bool> ConcurrentBook(TimeOnly start, IInterceptor interceptor)
    {
        await using var context = new AppDbContext(Options(interceptor));
        try { await new AppointmentService(context).CreateAsync(patient.Id, Request(concurrentDate, start)); return true; }
        catch (InvalidOperationException ex) when (ex.Message == "The selected appointment slot is no longer available.") { return false; }
    }
    async Task<List<AvailableSlotResponse>> ConcurrentRead()
    {
        await using var context = new AppDbContext(Options(readAttempt));
        return await new AppointmentService(context).GetAvailableSlotsAsync(doctor.Id, concurrentDate);
    }
    var firstTask = ConcurrentBook(new TimeOnly(9, 0), hold);
    Task<bool>? secondTask = null;
    Task<List<AvailableSlotResponse>>? readTask = null;
    bool secondWaited = false, readWaited = false;
    try
    {
        await hold.Holding.Task.WaitAsync(TimeSpan.FromSeconds(10));
        secondTask = ConcurrentBook(new TimeOnly(9, 15), secondAttempt);
        readTask = ConcurrentRead();
        await secondAttempt.Attempted.Task.WaitAsync(TimeSpan.FromSeconds(5));
        await readAttempt.Attempted.Task.WaitAsync(TimeSpan.FromSeconds(5));
        await Task.Delay(150);
        secondWaited = !secondTask.IsCompleted;
        readWaited = !readTask.IsCompleted;
    }
    finally
    {
        hold.Release.TrySetResult();
        await firstTask;
        if (secondTask is not null) await secondTask;
        if (readTask is not null) await readTask;
    }
    Check(secondWaited && readWaited, "Concurrent booking and availability read wait for transaction-owned doctor/date lock");
    Check(await firstTask && secondTask is not null && !await secondTask &&
        await db.Appointments.CountAsync(x => x.DoctorId == doctor.Id && x.AppointmentDate == concurrentDate) == 1,
        "Concurrent different-start overlapping bookings admit exactly one appointment");
    Check(readTask is not null && (await readTask).Where(x => x.StartTime >= new TimeOnly(9, 0) && x.StartTime < new TimeOnly(9, 30)).All(x => !x.IsAvailable && x.Reason == SlotAvailabilityReason.Full),
        "Availability read observes committed booking after lock release");

    var queueAppointment = await Seed(today, new TimeOnly(9, 0), new TimeOnly(9, 30), AppointmentStatus.Confirmed);
    var notifier = new RecordingNotifier();
    await using (var queueDb = new AppDbContext(Options()))
    {
        var queue = new QueueService(queueDb, notifier, NullLogger<QueueService>.Instance);
        var entry = await queue.CheckInAsync(patient.Id, queueAppointment.Id);
        await queue.CallAsync(doctorUser.Id, entry.Id);
        await queue.StartAsync(doctorUser.Id, entry.Id);
        var complete = await queue.CompleteAsync(doctorUser.Id, entry.Id);
        Check(complete?.Status == QueueStatus.Completed && complete.CompletedAt is not null && notifier.Count == 4, "Existing CheckIn/Call/Start/Complete flow and notifications succeed");
        Check(await queueDb.Appointments.AsNoTracking().AnyAsync(x => x.Id == queueAppointment.Id && x.Status == AppointmentStatus.Completed) &&
            await queueDb.QueueEntries.AsNoTracking().AnyAsync(x => x.Id == entry.Id && x.Status == QueueStatus.Completed && x.CheckedInAt != default && x.CalledAt != null && x.StartedAt != null && x.CompletedAt != null),
            "Completed appointment and queue history/timestamps preserved");
        Check((await Slots(today)).Where(x => x.StartTime == new TimeOnly(9, 0) || x.StartTime == new TimeOnly(9, 15)).All(x => x.Reason == SlotAvailabilityReason.Completed),
            "Queue completion produces Completed availability reason for overlapping candidates");
    }
    Check(await db.Appointments.AsNoTracking().AnyAsync(x => x.Id == exact.Id && x.Status == AppointmentStatus.Completed) &&
        await db.Appointments.AsNoTracking().AnyAsync(x => x.Id == partial.Id && x.Status == AppointmentStatus.Completed), "Availability and rejected bookings preserve Completed records");
    var jsonOptions = new JsonSerializerOptions(JsonSerializerDefaults.Web);
    jsonOptions.Converters.Add(new JsonStringEnumConverter());
    using var response = JsonDocument.Parse(JsonSerializer.Serialize(exactSlots[0], jsonOptions));
    Check(response.RootElement.GetProperty("reason").GetString() == "Completed" &&
        !response.RootElement.GetProperty("isAvailable").GetBoolean() &&
        response.RootElement.TryGetProperty("startTime", out _) && response.RootElement.TryGetProperty("endTime", out _),
        "API serialization preserves times and adds boolean availability and string reason");
    Console.WriteLine($"{passed} checks passed.");
}
finally
{
    // Remove only IDs created by this run; production appointments/history are untouched.
    await using var cleanup = new AppDbContext(Options());
    await using var transaction = await cleanup.Database.BeginTransactionAsync();
    await cleanup.QueueEntries.Where(x => x.DoctorId == doctor.Id).ExecuteDeleteAsync();
    await cleanup.Appointments.Where(x => x.DoctorId == doctor.Id).ExecuteDeleteAsync();
    await cleanup.DoctorSchedules.Where(x => x.DoctorId == doctor.Id).ExecuteDeleteAsync();
    await cleanup.Doctors.Where(x => x.Id == doctor.Id).ExecuteDeleteAsync();
    await cleanup.PatientProfiles.Where(x => x.Id == profile.Id).ExecuteDeleteAsync();
    await cleanup.Users.Where(x => x.Id == patient.Id || x.Id == doctorUser.Id).ExecuteDeleteAsync();
    await cleanup.Departments.Where(x => x.Id == department.Id).ExecuteDeleteAsync();
    await transaction.CommitAsync();
    Console.WriteLine("Disposable SQL test records removed; no schema changes.");
}

sealed class HoldBookingInterceptor : SaveChangesInterceptor
{
    public TaskCompletionSource Holding { get; } = new(TaskCreationOptions.RunContinuationsAsynchronously);
    public TaskCompletionSource Release { get; } = new(TaskCreationOptions.RunContinuationsAsynchronously);
    public override async ValueTask<InterceptionResult<int>> SavingChangesAsync(DbContextEventData eventData,
        InterceptionResult<int> result, CancellationToken cancellationToken = default)
    {
        Holding.TrySetResult();
        await Release.Task.WaitAsync(TimeSpan.FromSeconds(10), cancellationToken);
        return result;
    }
}

sealed class LockAttemptInterceptor : DbCommandInterceptor
{
    public TaskCompletionSource Attempted { get; } = new(TaskCreationOptions.RunContinuationsAsynchronously);
    public override ValueTask<InterceptionResult<int>> NonQueryExecutingAsync(DbCommand command,
        CommandEventData eventData, InterceptionResult<int> result, CancellationToken cancellationToken = default)
    {
        if (command.CommandText.Contains("sp_getapplock", StringComparison.Ordinal)) Attempted.TrySetResult();
        return ValueTask.FromResult(result);
    }
}

sealed class RecordingNotifier : IQueueNotifier
{
    public int Count { get; private set; }
    public Task NotifyQueueUpdatedAsync(Guid patientUserId, Guid doctorUserId, QueueEntryResponse queueEntry)
    {
        Count++;
        return Task.CompletedTask;
    }
}
