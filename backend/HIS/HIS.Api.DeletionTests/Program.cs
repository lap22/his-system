using System.Security.Claims;
using System.Text.Json;
using HIS.Api.Controllers;
using HIS.Api.Data;
using HIS.Api.Entities;
using HIS.Api.Enums;
using HIS.Api.Middleware;
using HIS.Api.Services.PatientProfiles;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Infrastructure;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;

// Uses the real SQL Server with disposable records inside a rolled-back transaction.
var apiDirectory = Path.GetFullPath(args.Length > 0 ? args[0] : "backend/HIS/HIS.Api");
var configuration = new ConfigurationBuilder().SetBasePath(apiDirectory)
    .AddJsonFile("appsettings.json")
    .AddJsonFile("appsettings.Development.json", optional: true)
    .AddEnvironmentVariables().Build();
var race = new AppointmentRaceInterceptor();
var options = new DbContextOptionsBuilder<AppDbContext>()
    .UseSqlServer(configuration.GetConnectionString("DefaultConnection"))
    .AddInterceptors(race).Options;
await using var db = new AppDbContext(options);
await using var transaction = await db.Database.BeginTransactionAsync();
try
{
    var suffix = Guid.NewGuid().ToString("N");
    var owner = new User { Email = $"delete-test-{suffix}@example.invalid", PasswordHash = "test-only", Role = UserRole.Patient };
    var other = new User { Email = $"delete-other-{suffix}@example.invalid", PasswordHash = "test-only", Role = UserRole.Patient };
    var doctorUser = new User { Email = $"delete-doctor-{suffix}@example.invalid", PasswordHash = "test-only", Role = UserRole.Doctor };
    var department = new Department { Name = $"Deletion test {suffix}" };
    var doctor = new Doctor { User = doctorUser, Department = department, FullName = "Test doctor", Specialization = "Test", LicenseNumber = suffix };
    db.AddRange(owner, other, doctor);
    await db.SaveChangesAsync();
    PatientProfile Profile(bool isDefault = false) => new()
    {
        UserId = owner.Id, FullName = "Deletion test", DateOfBirth = new DateOnly(2000, 1, 1),
        Gender = "Other", Relationship = RelationshipType.Other, IsDefault = isDefault
    };
    var defaultProfile = Profile(true);
    var successor = Profile();
    var ordinary = Profile();
    var withHistory = Profile();
    var raceProfile = Profile();
    PatientProfile[] profiles = [defaultProfile, successor, ordinary, withHistory, raceProfile];
    var createdAt = DateTime.UtcNow.AddMinutes(-5);
    for (var index = 0; index < profiles.Length; index++)
    {
        profiles[index].CreatedAt = createdAt.AddMinutes(index);
    }
    db.AddRange(profiles);
    await db.SaveChangesAsync();
    var appointment = new Appointment
    {
        PatientProfileId = withHistory.Id, DoctorId = doctor.Id,
        AppointmentDate = new DateOnly(2030, 1, 1), StartTime = new TimeOnly(9, 0),
        EndTime = new TimeOnly(9, 30), Status = AppointmentStatus.Completed, Symptoms = "Test history"
    };
    db.Add(appointment);
    await db.SaveChangesAsync();
    var appointmentBefore = JsonSerializer.Serialize(await db.Appointments.AsNoTracking()
        .Where(x => x.Id == appointment.Id)
        .Select(x => new { x.Id, x.PatientProfileId, x.DoctorId, x.AppointmentDate, x.StartTime, x.EndTime,
            x.Status, x.Symptoms, x.CreatedAt, x.UpdatedAt, x.CancelledAt, x.CancellationReason }).SingleAsync());
    var service = new PatientProfileService(db);

    async Task<(int Status, string Body)> Delete(Guid userId, Guid profileId)
    {
        var context = new DefaultHttpContext();
        context.User = new ClaimsPrincipal(new ClaimsIdentity(
            [new Claim(ClaimTypes.NameIdentifier, userId.ToString()), new Claim(ClaimTypes.Role, "Patient")], "Test"));
        context.Response.Body = new MemoryStream();
        var controller = new PatientProfilesController(service) { ControllerContext = new ControllerContext { HttpContext = context } };
        var middleware = new ExceptionHandlingMiddleware(async http =>
        {
            var result = await controller.Delete(profileId);
            http.Response.StatusCode = ((IStatusCodeActionResult)result).StatusCode!.Value;
        }, NullLogger<ExceptionHandlingMiddleware>.Instance);
        await middleware.InvokeAsync(context);
        context.Response.Body.Position = 0;
        return (context.Response.StatusCode, await new StreamReader(context.Response.Body).ReadToEndAsync());
    }
    void Check(bool condition, string name)
    {
        if (!condition) throw new Exception($"FAIL: {name}");
        Console.WriteLine($"PASS: {name}");
    }
    void CheckConflict((int Status, string Body) response, string name)
    {
        using var body = JsonDocument.Parse(response.Body);
        Check(response.Status == 409 && body.RootElement.GetProperty("statusCode").GetInt32() == 409 &&
            body.RootElement.GetProperty("message").GetString() ==
                "This patient profile cannot be deleted because it has appointment history." &&
            body.RootElement.EnumerateObject().Count() == 2, name);
    }

    Check((await Delete(other.Id, withHistory.Id)).Status == 404, "Other user's profile returns 404 before checking appointment history");
    Check((await Delete(owner.Id, ordinary.Id)).Status == 204 &&
        !await db.PatientProfiles.AnyAsync(x => x.Id == ordinary.Id), "Profile without appointments deleted (204)");
    CheckConflict(await Delete(owner.Id, withHistory.Id), "Appointment history returns safe 409 business response");
    Check(await db.PatientProfiles.AnyAsync(x => x.Id == withHistory.Id), "Blocked profile remains present");
    var appointmentAfter = JsonSerializer.Serialize(await db.Appointments.AsNoTracking()
        .Where(x => x.Id == appointment.Id)
        .Select(x => new { x.Id, x.PatientProfileId, x.DoctorId, x.AppointmentDate, x.StartTime, x.EndTime,
            x.Status, x.Symptoms, x.CreatedAt, x.UpdatedAt, x.CancelledAt, x.CancellationReason }).SingleAsync());
    Check(appointmentBefore == appointmentAfter, "Related appointment fields remain unchanged");
    Check((await Delete(owner.Id, defaultProfile.Id)).Status == 204 &&
        await db.PatientProfiles.AnyAsync(x => x.Id == successor.Id && x.IsDefault) &&
        await db.PatientProfiles.CountAsync(x => x.UserId == owner.Id && x.IsDefault) == 1,
        "Default deletion reassigns default to oldest remaining profile");

    race.ProfileId = raceProfile.Id;
    race.DoctorId = doctor.Id;
    CheckConflict(await Delete(owner.Id, raceProfile.Id), "Appointment inserted after pre-check produces 409 via real SQL FK violation");
    Check(race.Inserted && await db.PatientProfiles.AnyAsync(x => x.Id == raceProfile.Id) &&
        await db.Appointments.AnyAsync(x => x.Id == race.AppointmentId) &&
        await db.PatientProfiles.AnyAsync(x => x.Id == successor.Id && x.IsDefault),
        "Race preserves profile, new appointment and current default");
}
finally
{
    await transaction.RollbackAsync();
    Console.WriteLine("Test transaction rolled back; no test data retained.");
}

sealed class AppointmentRaceInterceptor : SaveChangesInterceptor
{
    public Guid? ProfileId { get; set; }
    public Guid DoctorId { get; set; }
    public Guid AppointmentId { get; } = Guid.NewGuid();
    public bool Inserted { get; private set; }

    public override async ValueTask<InterceptionResult<int>> SavingChangesAsync(
        DbContextEventData eventData, InterceptionResult<int> result, CancellationToken cancellationToken = default)
    {
        var db = eventData.Context!;
        if (!Inserted && ProfileId is Guid profileId && db.ChangeTracker.Entries<PatientProfile>()
            .Any(x => x.Entity.Id == profileId && x.State == EntityState.Deleted))
        {
            // Simulates the interleaving after AnyAsync, using the same test transaction.
            await db.Database.ExecuteSqlInterpolatedAsync($"INSERT INTO [Appointments] ([Id], [PatientProfileId], [DoctorId], [AppointmentDate], [StartTime], [EndTime], [Status], [CreatedAt]) VALUES ({AppointmentId}, {profileId}, {DoctorId}, {new DateOnly(2030, 1, 2)}, {new TimeOnly(9, 0)}, {new TimeOnly(9, 30)}, {"Pending"}, {DateTime.UtcNow})", cancellationToken);
            Inserted = true;
        }
        return result;
    }
}
