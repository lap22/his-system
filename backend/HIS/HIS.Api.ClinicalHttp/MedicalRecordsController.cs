using System.Security.Claims;
using HIS.Api.DTOs.MedicalRecords;
using HIS.Api.Services.Clinical;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;

namespace HIS.Api.ClinicalHttp;

[ApiController]
[Route("api/MedicalRecords")]
[Authorize]
public sealed class MedicalRecordsController(
    IMedicalRecordApplicationService applicationService) : ControllerBase
{
    [HttpGet("appointment/{appointmentId:guid}")]
    [Authorize(Roles = "Doctor,Patient")]
    public Task<ActionResult<MedicalRecordResponse?>> GetByAppointment(
        Guid appointmentId, CancellationToken cancellationToken) =>
        ExecuteAsync<MedicalRecordResponse?>(async actor =>
        {
            var response = await applicationService.LoadByAppointmentAsync(
                actor, appointmentId, cancellationToken);
            return response is null ? NotFound() : Ok(response);
        });

    [HttpPost]
    [Authorize(Roles = "Doctor")]
    public Task<ActionResult<MedicalRecordResponse>> Create(
        [FromBody] CreateMedicalRecordRequest request,
        CancellationToken cancellationToken) =>
        ExecuteAsync<MedicalRecordResponse>(async actor =>
        {
            var response = await applicationService.CreateDraftAsync(
                actor, request, CorrelationId(), cancellationToken);
            return CreatedAtAction(nameof(GetByAppointment),
                new { appointmentId = response.AppointmentId }, response);
        });

    [HttpPut("{id:guid}/draft")]
    [Authorize(Roles = "Doctor")]
    public Task<ActionResult<MedicalRecordResponse>> UpdateDraft(
        Guid id, [FromBody] UpdateMedicalRecordDraftRequest request,
        CancellationToken cancellationToken) =>
        ExecuteAsync<MedicalRecordResponse>(async actor => Ok(await applicationService.UpdateDraftAsync(
            actor, id, request, CorrelationId(), cancellationToken)));

    [HttpPost("{id:guid}/finalize")]
    [Authorize(Roles = "Doctor")]
    public Task<ActionResult<MedicalRecordResponse>> Finalize(
        Guid id, [FromBody] FinalizeMedicalRecordRequest request,
        CancellationToken cancellationToken) =>
        ExecuteAsync<MedicalRecordResponse>(async actor => Ok(await applicationService.FinalizeAsync(
            actor, id, request, CorrelationId(), cancellationToken)));

    [HttpGet("patient-profile/{profileId:guid}")]
    [Authorize(Roles = "Patient")]
    public Task<ActionResult<IReadOnlyList<MedicalRecordResponse>>> ListForPatientProfile(
        Guid profileId, CancellationToken cancellationToken) =>
        ExecuteAsync<IReadOnlyList<MedicalRecordResponse>>(async actor => Ok(
            await applicationService.ListFinalizedForPatientProfileAsync(
                actor, profileId, cancellationToken)));

    private async Task<ActionResult<T>> ExecuteAsync<T>(
        Func<ClinicalActor, Task<ActionResult<T>>> action)
    {
        var actor = CurrentActor();
        if (actor is null) return Unauthorized();

        try
        {
            return await action(actor);
        }
        catch (ClinicalWorkflowException error)
        {
            return error.Failure switch
            {
                ClinicalWorkflowFailure.InvalidRequest or
                ClinicalWorkflowFailure.BusinessRule => Problem(
                    statusCode: StatusCodes.Status400BadRequest,
                    detail: error.Message),
                ClinicalWorkflowFailure.AccessDenied or
                ClinicalWorkflowFailure.NotFound => Problem(
                    statusCode: StatusCodes.Status404NotFound,
                    detail: error.Message),
                ClinicalWorkflowFailure.Conflict => Problem(
                    statusCode: StatusCodes.Status409Conflict,
                    detail: error.Message),
                _ => Problem(statusCode: StatusCodes.Status500InternalServerError,
                    detail: "The clinical operation could not be completed.")
            };
        }
        catch (OperationCanceledException) when (HttpContext.RequestAborted.IsCancellationRequested)
        {
            throw;
        }
        catch (Exception)
        {
            return Problem(statusCode: StatusCodes.Status500InternalServerError,
                detail: "The clinical operation could not be completed.");
        }
    }

    private ClinicalActor? CurrentActor()
    {
        if (User.Identity?.IsAuthenticated != true) return null;
        var idValue = User.FindFirstValue(ClaimTypes.NameIdentifier);
        var role = User.FindFirstValue(ClaimTypes.Role);
        return Guid.TryParse(idValue, out var userId) &&
               !string.IsNullOrWhiteSpace(role)
            ? new ClinicalActor(userId, role)
            : null;
    }

    private string CorrelationId() => HttpContext.TraceIdentifier;
}
