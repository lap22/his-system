using System.ComponentModel.DataAnnotations;
using HIS.Api.DTOs.MedicalRecords;
using HIS.Api.Enums;

namespace HIS.Api.Services.Clinical;

// Deliberately not registered in DI. This orchestration remains offline until
// the protected schema and a production EF store receive separate approval.
public sealed class MedicalRecordApplicationService(
    IClinicalWorkflowStore store,
    IClinicalClock clock) : IMedicalRecordApplicationService
{
    public const bool AutomaticallyRetryMutations = false;

    public Task<MedicalRecordResponse?> LoadByAppointmentAsync(
        ClinicalActor actor, Guid appointmentId,
        CancellationToken cancellationToken = default) =>
        store.ExecuteTransactionAsync(async (transaction, token) =>
        {
            var appointment = await transaction.FindAppointmentAsync(appointmentId, token)
                ?? throw Fail(ClinicalWorkflowFailure.NotFound);
            var record = await transaction.FindRecordByAppointmentAsync(appointmentId, token);

            if (actor.Role == UserRole.Doctor.ToString())
            {
                var doctor = await transaction.FindDoctorByUserIdAsync(actor.UserId, token);
                if (doctor is null || !doctor.IsActive || doctor.Id != appointment.DoctorId)
                    throw Fail(ClinicalWorkflowFailure.AccessDenied);
            }
            else if (actor.Role == UserRole.Patient.ToString())
            {
                var profile = await transaction.FindPatientProfileAsync(appointment.PatientProfileId, token);
                if (profile?.OwnerUserId != actor.UserId ||
                    record?.Status != MedicalRecordContractStatus.Finalized)
                    throw Fail(ClinicalWorkflowFailure.AccessDenied);
            }
            else throw Fail(ClinicalWorkflowFailure.AccessDenied);

            return record is null ? null : Map(record);
        }, cancellationToken);

    public Task<MedicalRecordResponse> CreateDraftAsync(
        ClinicalActor actor, CreateMedicalRecordRequest request, string correlationId,
        CancellationToken cancellationToken = default)
    {
        Validate(request);
        return store.ExecuteTransactionAsync(async (transaction, token) =>
        {
            var appointment = await transaction.FindAppointmentAsync(request.AppointmentId, token)
                ?? throw Fail(ClinicalWorkflowFailure.NotFound);
            var doctor = await transaction.FindDoctorByUserIdAsync(actor.UserId, token);
            var existing = await transaction.FindRecordByAppointmentAsync(request.AppointmentId, token);
            RequireAllowed(MedicalRecordPolicy.CanCreateDraft(actor.Role,
                doctor?.IsActive == true, doctor?.Id ?? Guid.Empty,
                appointment.DoctorId, appointment.Status, existing is not null));

            var now = clock.UtcNow;
            var proposed = new ClinicalRecordState(Guid.NewGuid(), appointment.Id,
                appointment.PatientProfileId, appointment.DoctorId,
                request.ChiefComplaint, request.Symptoms, request.Diagnosis,
                request.Treatment, request.DoctorNotes,
                MedicalRecordContractStatus.Draft, string.Empty, now,
                null, null, null);
            ClinicalRecordState inserted;
            try { inserted = await transaction.InsertAsync(proposed, token); }
            catch (ClinicalStoreConcurrencyException) { throw Fail(ClinicalWorkflowFailure.Conflict); }
            await transaction.AppendAuditAsync(new ClinicalAuditWrite(inserted.Id,
                actor.UserId, "DraftCreated", now, RequiredCorrelation(correlationId),
                null, inserted.RowVersion), token);
            return Map(inserted);
        }, cancellationToken);
    }

    public Task<MedicalRecordResponse> UpdateDraftAsync(
        ClinicalActor actor, Guid id, UpdateMedicalRecordDraftRequest request,
        string correlationId, CancellationToken cancellationToken = default)
    {
        Validate(request);
        return MutateAsync(actor, id, request, request.RowVersion,
            finalize: false, correlationId, cancellationToken);
    }

    public Task<MedicalRecordResponse> FinalizeAsync(
        ClinicalActor actor, Guid id, FinalizeMedicalRecordRequest request,
        string correlationId, CancellationToken cancellationToken = default)
    {
        Validate(request);
        return MutateAsync(actor, id, request, request.RowVersion,
            finalize: true, correlationId, cancellationToken);
    }

    public Task<IReadOnlyList<MedicalRecordResponse>> ListFinalizedForPatientProfileAsync(
        ClinicalActor actor, Guid profileId,
        CancellationToken cancellationToken = default) =>
        store.ExecuteTransactionAsync(async (transaction, token) =>
        {
            var profile = await transaction.FindPatientProfileAsync(profileId, token)
                ?? throw Fail(ClinicalWorkflowFailure.NotFound);
            var access = MedicalRecordPolicy.CanPatientRead(actor.Role,
                actor.UserId, profile.OwnerUserId, MedicalRecordContractStatus.Finalized);
            RequireAllowed(access);
            var records = await transaction.ListFinalizedAsync(profileId, token);
            IReadOnlyList<MedicalRecordResponse> response = records
                .Where(x => x.Status == MedicalRecordContractStatus.Finalized)
                .Select(Map).ToArray();
            return response;
        }, cancellationToken);

    private Task<MedicalRecordResponse> MutateAsync(
        ClinicalActor actor, Guid id, MedicalRecordContentRequest request,
        string version, bool finalize, string correlationId,
        CancellationToken cancellationToken) =>
        store.ExecuteTransactionAsync(async (transaction, token) =>
        {
            var record = await transaction.FindRecordByIdAsync(id, token)
                ?? throw Fail(ClinicalWorkflowFailure.NotFound);
            var appointment = await transaction.FindAppointmentAsync(record.AppointmentId, token)
                ?? throw Fail(ClinicalWorkflowFailure.NotFound);
            var doctor = await transaction.FindDoctorByUserIdAsync(actor.UserId, token);
            RequireAllowed(MedicalRecordPolicy.CanMutateDraft(actor.Role,
                doctor?.IsActive == true, doctor?.Id ?? Guid.Empty,
                appointment.DoctorId, appointment.Status, record.Status,
                version, record.RowVersion));

            var now = clock.UtcNow;
            var changed = record with
            {
                ChiefComplaint = request.ChiefComplaint,
                Symptoms = request.Symptoms,
                Diagnosis = request.Diagnosis,
                Treatment = request.Treatment,
                DoctorNotes = request.DoctorNotes,
                Status = finalize ? MedicalRecordContractStatus.Finalized : record.Status,
                UpdatedAt = now,
                FinalizedAt = finalize ? now : record.FinalizedAt,
                FinalizedByUserId = finalize ? actor.UserId : record.FinalizedByUserId
            };
            ClinicalRecordState saved;
            try { saved = await transaction.UpdateAsync(changed, version, token); }
            catch (ClinicalStoreConcurrencyException) { throw Fail(ClinicalWorkflowFailure.Conflict); }
            await transaction.AppendAuditAsync(new ClinicalAuditWrite(saved.Id,
                actor.UserId, finalize ? "Finalized" : "DraftUpdated", now,
                RequiredCorrelation(correlationId), record.RowVersion,
                saved.RowVersion), token);
            return Map(saved);
        }, cancellationToken);

    private static void Validate(object request)
    {
        if (!Validator.TryValidateObject(request, new ValidationContext(request), [], true))
            throw Fail(ClinicalWorkflowFailure.InvalidRequest);
    }

    private static string RequiredCorrelation(string value) =>
        string.IsNullOrWhiteSpace(value) || value.Length > 128
            ? throw Fail(ClinicalWorkflowFailure.InvalidRequest)
            : value;

    private static void RequireAllowed(MedicalRecordPolicyResult result)
    {
        if (result.Allowed) return;
        throw Fail(result.Failure switch
        {
            MedicalRecordPolicyFailure.RecordAlreadyExists or
            MedicalRecordPolicyFailure.StaleConcurrencyToken => ClinicalWorkflowFailure.Conflict,
            MedicalRecordPolicyFailure.MissingConcurrencyToken => ClinicalWorkflowFailure.InvalidRequest,
            MedicalRecordPolicyFailure.RecordNotDraft or
            MedicalRecordPolicyFailure.AppointmentNotInProgress => ClinicalWorkflowFailure.BusinessRule,
            _ => ClinicalWorkflowFailure.AccessDenied
        });
    }

    private static ClinicalWorkflowException Fail(ClinicalWorkflowFailure failure) => new(failure);

    private static MedicalRecordResponse Map(ClinicalRecordState state) => new()
    {
        Id = state.Id, AppointmentId = state.AppointmentId,
        PatientProfileId = state.PatientProfileId, DoctorId = state.DoctorId,
        ChiefComplaint = state.ChiefComplaint, Symptoms = state.Symptoms,
        Diagnosis = state.Diagnosis, Treatment = state.Treatment,
        DoctorNotes = state.DoctorNotes, Status = state.Status,
        RowVersion = state.RowVersion, CreatedAt = state.CreatedAt,
        UpdatedAt = state.UpdatedAt, FinalizedAt = state.FinalizedAt,
        FinalizedByUserId = state.FinalizedByUserId
    };
}
