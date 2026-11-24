using HIS.Api.Enums;
using HIS.Api.Services;

var repositoryRoot = Path.GetFullPath(args.Length == 1
    ? args[0]
    : Path.Combine(AppContext.BaseDirectory, "../../../../.."));
var appointmentSource = File.ReadAllText(Path.Combine(repositoryRoot,
    "backend/HIS/HIS.Api/Services/AppointmentService.cs"));
var scheduleSource = File.ReadAllText(Path.Combine(repositoryRoot,
    "backend/HIS/HIS.Api/Services/DoctorScheduleService.cs"));
var middlewareSource = File.ReadAllText(Path.Combine(repositoryRoot,
    "backend/HIS/HIS.Api/Middleware/ExceptionHandlingMiddleware.cs"));
var passed = 0;

void Check(bool condition, string name)
{
    if (!condition)
        throw new InvalidOperationException($"FAIL: {name}");
    passed++;
    Console.WriteLine($"PASS: {name}");
}

var doctor = Guid.NewGuid();
var otherDoctor = Guid.NewGuid();
var scheduleId = Guid.NewGuid();
var now = new DateTime(2026, 11, 9, 8, 0, 0, DateTimeKind.Unspecified);
var futureMonday = new DateOnly(2026, 11, 16);
var current = new ScheduleCoverage(scheduleId, doctor, DayOfWeek.Monday,
    new TimeOnly(9, 0), new TimeOnly(12, 0), 30, 6, true);
var unchanged = current;
AppointmentCoverage Appointment(
    AppointmentStatus status = AppointmentStatus.Pending,
    Guid? doctorId = null,
    DateOnly? date = null,
    TimeOnly? start = null,
    TimeOnly? end = null) => new(
        doctorId ?? doctor,
        date ?? futureMonday,
        start ?? new TimeOnly(10, 0),
        end ?? new TimeOnly(10, 30),
        status);
bool Preserves(
    ScheduleCoverage proposed,
    AppointmentCoverage appointment,
    params ScheduleCoverage[] alternatives) =>
    ScheduleAppointmentIntegrity.PreservesAffectedAppointments(
        current, proposed, alternatives, new[] { appointment }, now);

Check(!Preserves(current with { IsActive = false }, Appointment()),
    "Deactivation is blocked for a future Pending appointment");
Check(ScheduleAppointmentIntegrity.PreservesAffectedAppointments(
        current,
        current with { StartTime = new TimeOnly(8, 30) },
        Array.Empty<ScheduleCoverage>(),
        Array.Empty<AppointmentCoverage>(),
        now),
    "Schedule edit with no future bookings is allowed");
Check(!Preserves(current with { IsActive = false },
        Appointment(AppointmentStatus.Confirmed)),
    "Deactivation is blocked for a future Confirmed appointment");
Check(!Preserves(current with { IsActive = false },
        Appointment(AppointmentStatus.CheckedIn)) &&
      !Preserves(current with { IsActive = false },
        Appointment(AppointmentStatus.InProgress)),
    "Checked-in and in-progress future appointments remain protected");
Check(Preserves(current with { IsActive = false },
        Appointment(AppointmentStatus.Completed)),
    "Completed appointment history does not block a schedule change");
Check(Preserves(current with { IsActive = false },
        Appointment(AppointmentStatus.Cancelled)) &&
      Preserves(current with { IsActive = false },
        Appointment(AppointmentStatus.NoShow)),
    "Cancelled and no-show history do not block a schedule change");
Check(Preserves(current with { IsActive = false },
        Appointment(date: new DateOnly(2026, 11, 2))),
    "Past appointments do not block a schedule change");
Check(Preserves(current with { IsActive = false },
        Appointment(doctorId: otherDoctor)),
    "Another Doctor's appointments are outside the mutation scope");
Check(Preserves(current with { IsActive = false },
        Appointment(date: new DateOnly(2026, 11, 17))),
    "An appointment on an unaffected weekday does not block the change");
var alternate = current with { Id = Guid.NewGuid() };
Check(Preserves(current with { IsActive = false }, Appointment(), alternate),
    "Equivalent alternate active coverage permits deactivation");
Check(!Preserves(current with { EndTime = new TimeOnly(10, 0) }, Appointment()),
    "Shrinking working hours cannot orphan an appointment");
Check(!Preserves(current with { SlotDurationMinutes = 20 }, Appointment()),
    "Changing slot duration cannot invalidate appointment duration");
Check(!Preserves(current with { MaxPatients = 2 }, Appointment()),
    "Reducing capacity cannot remove an occupied generated slot");
Check(!Preserves(current with { DayOfWeek = DayOfWeek.Tuesday }, Appointment()),
    "Changing weekday cannot orphan a recurring-date appointment");
Check(Preserves(unchanged with { EndTime = new TimeOnly(13, 0) }, Appointment()),
    "A harmless extension that preserves the slot is allowed");
var boundaryNow = new DateTime(2026, 11, 9, 23, 55, 0, DateTimeKind.Unspecified);
Check(ScheduleAppointmentIntegrity.IsFutureNonTerminal(
        Appointment(date: new DateOnly(2026, 11, 10), start: new TimeOnly(0, 10)),
        boundaryNow) &&
      !ScheduleAppointmentIntegrity.IsFutureNonTerminal(
        Appointment(date: new DateOnly(2026, 11, 9), start: new TimeOnly(23, 50)),
        boundaryNow),
    "Hospital-local midnight boundary distinguishes future and past slots");
Check(!ScheduleAppointmentIntegrity.Covers(current,
        Appointment(start: new TimeOnly(10, 10), end: new TimeOnly(10, 40))),
    "Coverage requires the same generated slot grid");
Check(appointmentSource.Contains("AppointmentScheduleLock.AcquireSharedAsync", StringComparison.Ordinal) &&
      scheduleSource.Contains("AppointmentScheduleLock.AcquireExclusiveAsync", StringComparison.Ordinal),
    "Booking and schedule mutation use coordinated shared/exclusive locks");
Check(scheduleSource.Contains("if (request.IsActive)", StringComparison.Ordinal) &&
      scheduleSource.Contains("HasOverlapAsync(", StringComparison.Ordinal) &&
      scheduleSource.Contains("existing active schedule", StringComparison.Ordinal),
    "Reactivation retains active-schedule overlap rejection");
Check(middlewareSource.Contains("ScheduleAppointmentConflictException", StringComparison.Ordinal) &&
      middlewareSource.Contains("HttpStatusCode.Conflict", StringComparison.Ordinal),
    "Integrity rejection uses the established HTTP 409 conflict convention");

Console.WriteLine($"Schedule integrity checks: {passed}/{passed} PASS");
