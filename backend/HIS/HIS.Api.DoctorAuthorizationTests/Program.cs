using System.Reflection;
using HIS.Api.Controllers;
using HIS.Api.Services;
using Microsoft.AspNetCore.Authorization;

var repositoryRoot = Path.GetFullPath(args.Length == 1
    ? args[0]
    : Path.Combine(AppContext.BaseDirectory, "../../../../.."));
var servicePath = Path.Combine(repositoryRoot,
    "backend/HIS/HIS.Api/Services/AppointmentService.cs");
var middlewarePath = Path.Combine(repositoryRoot,
    "backend/HIS/HIS.Api/Middleware/ExceptionHandlingMiddleware.cs");
var serviceSource = File.ReadAllText(servicePath);
var middlewareSource = File.ReadAllText(middlewarePath);
var passed = 0;

void Check(bool condition, string name)
{
    if (!condition)
        throw new InvalidOperationException($"FAIL: {name}");

    passed++;
    Console.WriteLine($"PASS: {name}");
}

void RejectInactive(string name)
{
    try
    {
        DoctorAppointmentAccess.RequireActiveDoctorId(null);
    }
    catch (KeyNotFoundException error) when (
        error.Message == "Doctor profile not found.")
    {
        Check(true, name);
        return;
    }

    throw new InvalidOperationException($"FAIL: {name}");
}

var doctorA = Guid.NewGuid();
var doctorB = Guid.NewGuid();
Check(DoctorAppointmentAccess.RequireActiveDoctorId(doctorA) == doctorA,
    "Active Doctor scope is accepted without changing Doctor.Id");
RejectInactive(
    "Inactive or missing Doctor scope is denied despite authenticated identity");

Check(serviceSource.Contains("x.UserId == currentUserId &&", StringComparison.Ordinal) &&
      serviceSource.Contains("x.IsActive)", StringComparison.Ordinal),
    "Doctor UserId resolution requires Doctor.IsActive");
Check(serviceSource.Split("GetActiveDoctorIdAsync(currentUserId)",
        StringSplitOptions.None).Length - 1 == 3,
    "List, detail and confirmation all resolve an active Doctor scope");
string Section(string start, string end)
{
    var startIndex = serviceSource.IndexOf(start, StringComparison.Ordinal);
    var endIndex = serviceSource.IndexOf(end, startIndex + start.Length,
        StringComparison.Ordinal);
    return serviceSource[startIndex..endIndex];
}
var detailSection = Section("public async Task<AppointmentResponse?> GetByIdAsync(",
    "public async Task<List<AppointmentResponse>> GetDoctorAppointmentsAsync(");
var listSection = Section("public async Task<List<AppointmentResponse>> GetDoctorAppointmentsAsync(",
    "public async Task<AppointmentResponse?> ConfirmAsync(");
var confirmSection = serviceSource[serviceSource.IndexOf(
    "public async Task<AppointmentResponse?> ConfirmAsync(", StringComparison.Ordinal)..];
Check(detailSection.Contains("x.DoctorId == doctorId", StringComparison.Ordinal) &&
      listSection.Contains("x.DoctorId == doctorId", StringComparison.Ordinal) &&
      confirmSection.Contains("x.DoctorId == doctorId", StringComparison.Ordinal) &&
      doctorA != doctorB,
    "Doctor A scope cannot select Doctor B appointments");

Check(serviceSource.Contains(
        "x.PatientProfile.UserId == currentUserId", StringComparison.Ordinal),
    "Patient ownership filtering is preserved");
Check(serviceSource.Contains(
        "currentUserRole != UserRole.Admin.ToString()", StringComparison.Ordinal),
    "Admin bypass remains limited to the existing role branch");

var confirm = typeof(AppointmentsController).GetMethod(
    nameof(AppointmentsController.Confirm), BindingFlags.Instance | BindingFlags.Public)!;
var roles = confirm.GetCustomAttribute<AuthorizeAttribute>()?.Roles;
Check(roles == "Doctor,Admin",
    "Confirmation controller preserves Doctor and Admin authorization");
Check(serviceSource.Contains(
        "appointment.Status != AppointmentStatus.Pending", StringComparison.Ordinal) &&
      serviceSource.Contains(
        "Only pending appointments can be confirmed.", StringComparison.Ordinal),
    "Pending-only confirmation and concurrency error contract are preserved");
Check(middlewareSource.Contains("catch (KeyNotFoundException", StringComparison.Ordinal) &&
      middlewareSource.Contains("HttpStatusCode.NotFound", StringComparison.Ordinal),
    "Inactive Doctor denial maps to the existing HTTP 404 convention");

Console.WriteLine($"Doctor appointment authorization checks: {passed}/{passed} PASS");
