using System.Net;
using System.Text.Json;
using System.Text.Json.Serialization;
using HIS.Api.ClinicalHttp;
using HIS.Api.ClinicalHttpHostedTests;
using HIS.Api.Services.Clinical;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Hosting.Server;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;

var passed = 0;
void Check(bool condition, string name)
{
    if (!condition) throw new InvalidOperationException($"FAIL: {name}");
    passed++;
    Console.WriteLine($"PASS: {name}");
}

var builder = WebApplication.CreateBuilder(new WebApplicationOptions
{
    EnvironmentName = "OfflineHostedClinicalHttpTest"
});
builder.Logging.ClearProviders();
builder.Services.RemoveAll<IServer>();
builder.Services.AddSingleton<InMemoryServer>();
builder.Services.AddSingleton<IServer>(provider => provider.GetRequiredService<InMemoryServer>());
builder.Services.AddSingleton<FakeMedicalRecordApplicationService>();
builder.Services.AddSingleton<IMedicalRecordApplicationService>(provider =>
    provider.GetRequiredService<FakeMedicalRecordApplicationService>());
builder.Services.AddAuthentication(options =>
{
    options.DefaultAuthenticateScheme = "OfflineTest";
    options.DefaultChallengeScheme = "OfflineTest";
    options.DefaultForbidScheme = "OfflineTest";
}).AddScheme<AuthenticationSchemeOptions, TestAuthenticationHandler>("OfflineTest", _ => { });
builder.Services.AddAuthorization();
builder.Services.AddControllers()
    .AddApplicationPart(typeof(MedicalRecordsController).Assembly)
    .AddJsonOptions(options => options.JsonSerializerOptions.Converters.Add(
        new JsonStringEnumConverter()));

await using var app = builder.Build();
app.UseRouting();
app.UseAuthentication();
app.UseAuthorization();
app.MapControllers();
await app.StartAsync();

var server = app.Services.GetRequiredService<InMemoryServer>();
var fake = app.Services.GetRequiredService<FakeMedicalRecordApplicationService>();
var validCreate = JsonSerializer.Serialize(new
{
    appointmentId = FakeMedicalRecordApplicationService.FinalizedAppointment,
    chiefComplaint = "Synthetic complaint"
});
var validUpdate = JsonSerializer.Serialize(new
{
    rowVersion = FakeMedicalRecordApplicationService.Version,
    chiefComplaint = "Synthetic complaint"
});
var validFinalize = JsonSerializer.Serialize(new
{
    rowVersion = FakeMedicalRecordApplicationService.Version,
    chiefComplaint = "Synthetic complaint",
    diagnosis = "Synthetic diagnosis"
});

var routes = new[]
{
    ("GET", $"/api/MedicalRecords/appointment/{FakeMedicalRecordApplicationService.FinalizedAppointment}", (string?)null),
    ("POST", "/api/MedicalRecords", validCreate),
    ("PUT", $"/api/MedicalRecords/{FakeMedicalRecordApplicationService.RecordId}/draft", validUpdate),
    ("POST", $"/api/MedicalRecords/{FakeMedicalRecordApplicationService.RecordId}/finalize", validFinalize),
    ("GET", $"/api/MedicalRecords/patient-profile/{FakeMedicalRecordApplicationService.OwnedProfile}", (string?)null)
};

foreach (var route in routes)
{
    var anonymous = await server.SendAsync(route.Item1, route.Item2, route.Item3);
    Check(anonymous.StatusCode == (int)HttpStatusCode.Unauthorized,
        $"Anonymous {route.Item1} {route.Item2} returns 401 through middleware");
}

foreach (var route in routes)
{
    var admin = await server.SendAsync(route.Item1, route.Item2, route.Item3,
        Guid.NewGuid(), "Admin");
    Check(admin.StatusCode == (int)HttpStatusCode.Forbidden,
        $"Admin {route.Item1} {route.Item2} returns 403");
}

foreach (var route in routes.Where(x => x.Item1 != "GET"))
{
    var patient = await server.SendAsync(route.Item1, route.Item2, route.Item3,
        FakeMedicalRecordApplicationService.PatientA, "Patient");
    Check(patient.StatusCode == (int)HttpStatusCode.Forbidden,
        $"Patient mutation {route.Item2} returns 403");
}

var invalidRole = await server.SendAsync("GET", routes[0].Item2, null,
    Guid.NewGuid(), "UnknownRole");
Check(invalidRole.StatusCode == (int)HttpStatusCode.Forbidden,
    "Unknown authenticated role fails closed with 403");

fake.Reset();
var created = await server.SendAsync("POST", "/api/MedicalRecords", validCreate,
    FakeMedicalRecordApplicationService.DoctorA, "Doctor");
Check(created.StatusCode == (int)HttpStatusCode.Created,
    "Authorized Doctor Draft creation returns 201");
var updated = await server.SendAsync("PUT",
    $"/api/MedicalRecords/{FakeMedicalRecordApplicationService.RecordId}/draft", validUpdate,
    FakeMedicalRecordApplicationService.DoctorA, "Doctor");
Check(updated.StatusCode == (int)HttpStatusCode.OK,
    "Authorized Doctor Draft update returns 200");
var finalized = await server.SendAsync("POST",
    $"/api/MedicalRecords/{FakeMedicalRecordApplicationService.RecordId}/finalize", validFinalize,
    FakeMedicalRecordApplicationService.DoctorA, "Doctor");
Check(finalized.StatusCode == (int)HttpStatusCode.OK &&
      finalized.Body.Contains("\"status\":\"Finalized\"", StringComparison.Ordinal),
    "Authorized Doctor finalization returns 200 with string status JSON");

var doctorRead = await server.SendAsync("GET", routes[0].Item2, null,
    FakeMedicalRecordApplicationService.DoctorA, "Doctor");
Check(doctorRead.StatusCode == 200, "Assigned Doctor reads the clinical record");
var patientRead = await server.SendAsync("GET", routes[0].Item2, null,
    FakeMedicalRecordApplicationService.PatientA, "Patient");
Check(patientRead.StatusCode == 200 &&
      patientRead.Body.Contains("\"status\":\"Finalized\"", StringComparison.Ordinal),
    "Owning Patient reads a Finalized record");
var patientList = await server.SendAsync("GET", routes[4].Item2, null,
    FakeMedicalRecordApplicationService.PatientA, "Patient");
Check(patientList.StatusCode == 200, "Owning Patient lists Finalized profile records");

var foreignDoctor = await server.SendAsync("GET", routes[0].Item2, null,
    FakeMedicalRecordApplicationService.DoctorB, "Doctor");
Check(foreignDoctor.StatusCode == 404,
    "Doctor A record is concealed from Doctor B");
var draftForPatient = await server.SendAsync("GET",
    $"/api/MedicalRecords/appointment/{FakeMedicalRecordApplicationService.DraftAppointment}", null,
    FakeMedicalRecordApplicationService.PatientA, "Patient");
Check(draftForPatient.StatusCode == 404,
    "Draft record is concealed from Patient accounts");
var foreignProfile = await server.SendAsync("GET",
    $"/api/MedicalRecords/patient-profile/{FakeMedicalRecordApplicationService.ForeignProfile}", null,
    FakeMedicalRecordApplicationService.PatientA, "Patient");
Check(foreignProfile.StatusCode == 404,
    "Foreign PatientProfile history is concealed");

fake.Reset();
var invalidGuid = await server.SendAsync("GET", "/api/MedicalRecords/appointment/not-a-guid", null,
    FakeMedicalRecordApplicationService.DoctorA, "Doctor");
Check(invalidGuid.StatusCode == 404, "Invalid route GUID does not match the clinical route");
var missingAppointment = await server.SendAsync("POST", "/api/MedicalRecords", "{}",
    FakeMedicalRecordApplicationService.DoctorA, "Doctor");
Check(missingAppointment.StatusCode == 400 && fake.InvocationCount == 0,
    "Missing AppointmentId is rejected by model validation before the service");
var tooLong = JsonSerializer.Serialize(new
{
    appointmentId = FakeMedicalRecordApplicationService.FinalizedAppointment,
    chiefComplaint = new string('x', 2001)
});
var longField = await server.SendAsync("POST", "/api/MedicalRecords", tooLong,
    FakeMedicalRecordApplicationService.DoctorA, "Doctor");
Check(longField.StatusCode == 400 && fake.InvocationCount == 0,
    "Oversized clinical fields are rejected by model validation");
var whitespaceFinalize = JsonSerializer.Serialize(new
{
    rowVersion = FakeMedicalRecordApplicationService.Version,
    chiefComplaint = " ",
    diagnosis = "Synthetic diagnosis"
});
var whitespace = await server.SendAsync("POST",
    $"/api/MedicalRecords/{FakeMedicalRecordApplicationService.RecordId}/finalize",
    whitespaceFinalize, FakeMedicalRecordApplicationService.DoctorA, "Doctor");
Check(whitespace.StatusCode == 400 && fake.InvocationCount == 0,
    "Whitespace-only finalization content is rejected by model validation");
var missingVersion = await server.SendAsync("PUT",
    $"/api/MedicalRecords/{FakeMedicalRecordApplicationService.RecordId}/draft", "{}",
    FakeMedicalRecordApplicationService.DoctorA, "Doctor");
var malformedVersion = await server.SendAsync("PUT",
    $"/api/MedicalRecords/{FakeMedicalRecordApplicationService.RecordId}/draft",
    "{\"rowVersion\":\"not-base64\"}", FakeMedicalRecordApplicationService.DoctorA, "Doctor");
Check(missingVersion.StatusCode == 400 && malformedVersion.StatusCode == 400 &&
      fake.InvocationCount == 0,
    "Missing and malformed RowVersion tokens are rejected before the service");

foreach (var outcome in new[]
{
    (ClinicalWorkflowFailure.InvalidRequest, 400),
    (ClinicalWorkflowFailure.BusinessRule, 400),
    (ClinicalWorkflowFailure.NotFound, 404),
    (ClinicalWorkflowFailure.AccessDenied, 404),
    (ClinicalWorkflowFailure.Conflict, 409)
})
{
    fake.Reset();
    fake.NextFailure = outcome.Item1;
    var mapped = await server.SendAsync("PUT",
        $"/api/MedicalRecords/{FakeMedicalRecordApplicationService.RecordId}/draft", validUpdate,
        FakeMedicalRecordApplicationService.DoctorA, "Doctor");
    Check(mapped.StatusCode == outcome.Item2,
        $"Hosted pipeline maps {outcome.Item1} to {outcome.Item2}");
}

fake.Reset();
fake.ThrowUnexpected = true;
var unexpected = await server.SendAsync("PUT",
    $"/api/MedicalRecords/{FakeMedicalRecordApplicationService.RecordId}/draft", validUpdate,
    FakeMedicalRecordApplicationService.DoctorA, "Doctor");
Check(unexpected.StatusCode == 500 &&
      unexpected.Body.Contains("The clinical operation could not be completed.", StringComparison.Ordinal) &&
      !unexpected.Body.Contains("provider-secret", StringComparison.Ordinal) &&
      !unexpected.Body.Contains("password", StringComparison.Ordinal) &&
      !unexpected.Body.Contains("clinical-text", StringComparison.Ordinal),
    "Unexpected failures return generic 500 without provider or clinical leakage");

var apiProject = File.ReadAllText(Path.GetFullPath(Path.Combine(
    AppContext.BaseDirectory, "../../../../HIS.Api/HIS.Api.csproj")));
var apiProgram = File.ReadAllText(Path.GetFullPath(Path.Combine(
    AppContext.BaseDirectory, "../../../../HIS.Api/Program.cs")));
Check(!apiProject.Contains("HIS.Api.ClinicalHttp", StringComparison.Ordinal) &&
      !apiProgram.Contains("AddDormantMedicalRecordsServices", StringComparison.Ordinal) &&
      !apiProgram.Contains("MedicalRecordsController", StringComparison.Ordinal),
    "Production API has no dormant assembly reference, registration or activation flag");

Console.WriteLine($"Hosted Medical Records HTTP checks: {passed}/{passed} PASS");
await app.StopAsync();
