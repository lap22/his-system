using System.ComponentModel.DataAnnotations;
using System.Reflection;
using System.Security.Claims;
using System.Text.Json;
using HIS.Api.ClinicalHttp;
using HIS.Api.DTOs.MedicalRecords;
using HIS.Api.Services.Clinical;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Routing;

var passed = 0;
void Check(bool condition, string name)
{
    if (!condition) throw new InvalidOperationException($"FAIL: {name}");
    passed++;
    Console.WriteLine($"PASS: {name}");
}

var userId = Guid.Parse("11111111-1111-4111-8111-111111111111");
var appointmentId = Guid.Parse("22222222-2222-4222-8222-222222222222");
var recordId = Guid.Parse("33333333-3333-4333-8333-333333333333");
var profileId = Guid.Parse("44444444-4444-4444-8444-444444444444");
var version = RowVersionToken.Encode(new byte[8]);
var response = new MedicalRecordResponse
{
    Id = recordId,
    AppointmentId = appointmentId,
    PatientProfileId = profileId,
    DoctorId = Guid.NewGuid(),
    Status = MedicalRecordContractStatus.Draft,
    RowVersion = version
};

var fake = new FakeApplicationService(response);
var controller = Controller(fake, userId, "Doctor");
var created = await controller.Create(new CreateMedicalRecordRequest
{
    AppointmentId = appointmentId
}, CancellationToken.None);
Check(created.Result is CreatedAtActionResult result &&
      result.ActionName == nameof(MedicalRecordsController.GetByAppointment) &&
      Equals(result.RouteValues!["appointmentId"], appointmentId) &&
      fake.LastActor == new ClinicalActor(userId, "Doctor"),
    "Doctor creation delegates to the clinical application service and returns 201");
Check(fake.LastCorrelationId == "http-contract-test",
    "Mutation correlation uses the request trace identifier");

var unauthenticated = new MedicalRecordsController(fake)
{
    ControllerContext = new ControllerContext { HttpContext = new DefaultHttpContext() }
};
var unauthorized = await unauthenticated.Create(
    new CreateMedicalRecordRequest { AppointmentId = appointmentId },
    CancellationToken.None);
Check(unauthorized.Result is UnauthorizedResult,
    "Missing authenticated identity returns 401 before service invocation");

foreach (var item in new[]
{
    (ClinicalWorkflowFailure.InvalidRequest, 400),
    (ClinicalWorkflowFailure.BusinessRule, 400),
    (ClinicalWorkflowFailure.AccessDenied, 404),
    (ClinicalWorkflowFailure.NotFound, 404),
    (ClinicalWorkflowFailure.Conflict, 409)
})
{
    fake.Failure = item.Item1;
    var mapped = await Controller(fake, userId, "Doctor").UpdateDraft(recordId,
        new UpdateMedicalRecordDraftRequest { RowVersion = version }, CancellationToken.None);
    Check(mapped.Result is ObjectResult { StatusCode: var status } && status == item.Item2,
        $"{item.Item1} maps to HTTP {item.Item2}");
}
fake.Failure = null;

var controllerType = typeof(MedicalRecordsController);
var route = controllerType.GetCustomAttribute<RouteAttribute>();
Check(route?.Template == "api/MedicalRecords" &&
      Route(nameof(MedicalRecordsController.GetByAppointment)) == "appointment/{appointmentId:guid}" &&
      Route(nameof(MedicalRecordsController.Create)) is null &&
      Route(nameof(MedicalRecordsController.UpdateDraft)) == "{id:guid}/draft" &&
      Route(nameof(MedicalRecordsController.Finalize)) == "{id:guid}/finalize" &&
      Route(nameof(MedicalRecordsController.ListForPatientProfile)) == "patient-profile/{profileId:guid}",
    "Prepared routes exactly match the approved HTTP contract");
Check(Roles(nameof(MedicalRecordsController.Create)) == "Doctor" &&
      Roles(nameof(MedicalRecordsController.UpdateDraft)) == "Doctor" &&
      Roles(nameof(MedicalRecordsController.Finalize)) == "Doctor" &&
      Roles(nameof(MedicalRecordsController.ListForPatientProfile)) == "Patient" &&
      Roles(nameof(MedicalRecordsController.GetByAppointment)) == "Doctor,Patient" &&
      !controllerType.GetMethods().SelectMany(x => x.GetCustomAttributes<AuthorizeAttribute>())
          .Any(x => x.Roles?.Contains("Admin", StringComparison.Ordinal) == true),
    "Authorization metadata excludes Admin and limits every route to approved roles");

Check(!Valid(new UpdateMedicalRecordDraftRequest { RowVersion = "" }) &&
      !Valid(new FinalizeMedicalRecordRequest
      {
          RowVersion = version,
          ChiefComplaint = " ",
          Diagnosis = "Diagnosis"
      }) &&
      Valid(new FinalizeMedicalRecordRequest
      {
          RowVersion = version,
          ChiefComplaint = "Complaint",
          Diagnosis = "Diagnosis"
      }),
    "DTO validation requires canonical RowVersion and finalized clinical content");
Check(JsonSerializer.Serialize(MedicalRecordContractStatus.Finalized) == "\"Finalized\"",
    "HTTP status representation remains the approved JSON string");

var apiAssembly = typeof(MedicalRecordApplicationService).Assembly;
Check(!apiAssembly.GetTypes().Any(type =>
          typeof(ControllerBase).IsAssignableFrom(type) &&
          type.Name.Contains("MedicalRecords", StringComparison.Ordinal)) &&
      apiAssembly != controllerType.Assembly,
    "Medical Records controller remains outside the active API assembly");

Console.WriteLine($"Dormant Medical Records HTTP checks: {passed}/{passed} PASS");

MedicalRecordsController Controller(FakeApplicationService service, Guid id, string role)
{
    var identity = new ClaimsIdentity([
        new Claim(ClaimTypes.NameIdentifier, id.ToString()),
        new Claim(ClaimTypes.Role, role)
    ], "offline-test");
    var context = new DefaultHttpContext
    {
        User = new ClaimsPrincipal(identity),
        TraceIdentifier = "http-contract-test"
    };
    return new MedicalRecordsController(service)
    {
        ControllerContext = new ControllerContext { HttpContext = context }
    };
}

string? Route(string methodName) => controllerType.GetMethod(methodName)!
    .GetCustomAttributes().OfType<HttpMethodAttribute>().Single().Template;
string? Roles(string methodName) => controllerType.GetMethod(methodName)!
    .GetCustomAttribute<AuthorizeAttribute>()?.Roles;
bool Valid(object value) => Validator.TryValidateObject(value,
    new ValidationContext(value), [], true);

sealed class FakeApplicationService(MedicalRecordResponse response)
    : IMedicalRecordApplicationService
{
    public ClinicalWorkflowFailure? Failure { get; set; }
    public ClinicalActor? LastActor { get; private set; }
    public string? LastCorrelationId { get; private set; }

    private void Capture(ClinicalActor actor, string? correlationId = null)
    {
        LastActor = actor;
        LastCorrelationId = correlationId;
        if (Failure is { } failure) throw new ClinicalWorkflowException(failure);
    }

    public Task<MedicalRecordResponse?> LoadByAppointmentAsync(ClinicalActor actor,
        Guid appointmentId, CancellationToken cancellationToken = default)
    {
        Capture(actor);
        return Task.FromResult<MedicalRecordResponse?>(response);
    }

    public Task<MedicalRecordResponse> CreateDraftAsync(ClinicalActor actor,
        CreateMedicalRecordRequest request, string correlationId,
        CancellationToken cancellationToken = default)
    {
        Capture(actor, correlationId);
        return Task.FromResult(response);
    }

    public Task<MedicalRecordResponse> UpdateDraftAsync(ClinicalActor actor, Guid id,
        UpdateMedicalRecordDraftRequest request, string correlationId,
        CancellationToken cancellationToken = default)
    {
        Capture(actor, correlationId);
        return Task.FromResult(response);
    }

    public Task<MedicalRecordResponse> FinalizeAsync(ClinicalActor actor, Guid id,
        FinalizeMedicalRecordRequest request, string correlationId,
        CancellationToken cancellationToken = default)
    {
        Capture(actor, correlationId);
        return Task.FromResult(response);
    }

    public Task<IReadOnlyList<MedicalRecordResponse>> ListFinalizedForPatientProfileAsync(
        ClinicalActor actor, Guid profileId, CancellationToken cancellationToken = default)
    {
        Capture(actor);
        return Task.FromResult<IReadOnlyList<MedicalRecordResponse>>([response]);
    }
}
