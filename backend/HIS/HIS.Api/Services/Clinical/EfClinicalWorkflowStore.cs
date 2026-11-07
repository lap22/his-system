using HIS.Api.Data;
using HIS.Api.DTOs.MedicalRecords;
using HIS.Api.Entities;
using HIS.Api.Enums;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;

namespace HIS.Api.Services.Clinical;

// Intentionally not registered in Program.cs. The adapter remains unreachable
// until the clinical schema and API activation receive separate approval.
public sealed class EfClinicalWorkflowStore(AppDbContext dbContext) : IClinicalWorkflowStore
{
    public async Task<T> ExecuteTransactionAsync<T>(
        Func<IClinicalWorkflowTransaction, CancellationToken, Task<T>> operation,
        CancellationToken cancellationToken)
    {
        await using var databaseTransaction =
            await dbContext.Database.BeginTransactionAsync(cancellationToken);
        var transaction = new EfClinicalWorkflowTransaction(dbContext);

        return await ClinicalTransactionCoordinator.ExecuteAsync(
            token => operation(transaction, token),
            token => databaseTransaction.CommitAsync(token),
            token => databaseTransaction.RollbackAsync(token),
            cancellationToken);
    }
}

internal sealed class EfClinicalWorkflowTransaction(AppDbContext dbContext)
    : IClinicalWorkflowTransaction
{
    public async Task<ClinicalDoctor?> FindDoctorByUserIdAsync(
        Guid userId, CancellationToken cancellationToken)
    {
        var doctor = await dbContext.Doctors.AsNoTracking()
            .SingleOrDefaultAsync(x => x.UserId == userId, cancellationToken);
        return doctor is null ? null : new ClinicalDoctor(doctor.Id, doctor.IsActive);
    }

    public async Task<ClinicalAppointment?> FindAppointmentAsync(
        Guid appointmentId, CancellationToken cancellationToken)
    {
        var appointment = await dbContext.Appointments.AsNoTracking()
            .SingleOrDefaultAsync(x => x.Id == appointmentId, cancellationToken);
        return appointment is null ? null : new ClinicalAppointment(
            appointment.Id, appointment.PatientProfileId,
            appointment.DoctorId, appointment.Status);
    }

    public async Task<ClinicalPatientProfile?> FindPatientProfileAsync(
        Guid profileId, CancellationToken cancellationToken)
    {
        var profile = await dbContext.PatientProfiles.AsNoTracking()
            .SingleOrDefaultAsync(x => x.Id == profileId, cancellationToken);
        return profile is null ? null : new ClinicalPatientProfile(profile.Id, profile.UserId);
    }

    public async Task<ClinicalRecordState?> FindRecordByAppointmentAsync(
        Guid appointmentId, CancellationToken cancellationToken)
    {
        var record = await dbContext.MedicalRecords
            .SingleOrDefaultAsync(x => x.AppointmentId == appointmentId, cancellationToken);
        return record is null ? null : ClinicalPersistenceMapping.ToState(record);
    }

    public async Task<ClinicalRecordState?> FindRecordByIdAsync(
        Guid id, CancellationToken cancellationToken)
    {
        var record = await dbContext.MedicalRecords
            .SingleOrDefaultAsync(x => x.Id == id, cancellationToken);
        return record is null ? null : ClinicalPersistenceMapping.ToState(record);
    }

    public async Task<IReadOnlyList<ClinicalRecordState>> ListFinalizedAsync(
        Guid profileId, CancellationToken cancellationToken)
    {
        var records = await dbContext.MedicalRecords.AsNoTracking()
            .Where(x => x.PatientProfileId == profileId &&
                        x.Status == MedicalRecordStatus.Finalized)
            .OrderByDescending(x => x.FinalizedAt)
            .ThenByDescending(x => x.Id)
            .ToArrayAsync(cancellationToken);
        return records.Select(ClinicalPersistenceMapping.ToState).ToArray();
    }

    public async Task<ClinicalRecordState> InsertAsync(
        ClinicalRecordState record, CancellationToken cancellationToken)
    {
        var entity = ClinicalPersistenceMapping.ToNewEntity(record);
        dbContext.MedicalRecords.Add(entity);
        try
        {
            await dbContext.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateException error) when (
            ClinicalSqlConflictClassifier.IsDuplicateAppointment(error))
        {
            throw new ClinicalStoreConcurrencyException();
        }

        return ClinicalPersistenceMapping.ToState(entity);
    }

    public async Task<ClinicalRecordState> UpdateAsync(
        ClinicalRecordState record, string expectedVersion,
        CancellationToken cancellationToken)
    {
        var expectedBytes = RowVersionToken.Decode(expectedVersion);
        var entity = dbContext.MedicalRecords.Local
            .SingleOrDefault(x => x.Id == record.Id)
            ?? throw new ClinicalStoreConcurrencyException();

        ClinicalPersistenceMapping.ApplyMutableState(entity, record);
        dbContext.Entry(entity).Property(x => x.RowVersion).OriginalValue = expectedBytes;

        try
        {
            await dbContext.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateException error) when (
            ClinicalPersistenceExceptionClassifier.IsConcurrency(error))
        {
            throw new ClinicalStoreConcurrencyException();
        }

        return ClinicalPersistenceMapping.ToState(entity);
    }

    public async Task AppendAuditAsync(
        ClinicalAuditWrite audit, CancellationToken cancellationToken)
    {
        dbContext.ClinicalAuditEvents.Add(ClinicalPersistenceMapping.ToAuditEntity(audit));
        await dbContext.SaveChangesAsync(cancellationToken);
    }
}

public static class ClinicalPersistenceMapping
{
    public static ClinicalRecordState ToState(MedicalRecord entity) => new(
        entity.Id, entity.AppointmentId, entity.PatientProfileId, entity.DoctorId,
        entity.ChiefComplaint, entity.Symptoms, entity.Diagnosis,
        entity.Treatment, entity.DoctorNotes, ToContractStatus(entity.Status),
        RowVersionToken.Encode(entity.RowVersion), entity.CreatedAt,
        entity.UpdatedAt, entity.FinalizedAt, entity.FinalizedByUserId);

    public static MedicalRecord ToNewEntity(ClinicalRecordState state)
    {
        if (state.Status != MedicalRecordContractStatus.Draft ||
            !string.IsNullOrEmpty(state.RowVersion))
            throw new InvalidOperationException("The new clinical record state is invalid.");

        return new MedicalRecord
        {
            Id = state.Id,
            AppointmentId = state.AppointmentId,
            PatientProfileId = state.PatientProfileId,
            DoctorId = state.DoctorId,
            ChiefComplaint = state.ChiefComplaint,
            Symptoms = state.Symptoms,
            Diagnosis = state.Diagnosis,
            Treatment = state.Treatment,
            DoctorNotes = state.DoctorNotes,
            Status = MedicalRecordStatus.Draft,
            CreatedAt = state.CreatedAt
        };
    }

    public static void ApplyMutableState(MedicalRecord entity, ClinicalRecordState state)
    {
        if (entity.Id != state.Id ||
            entity.AppointmentId != state.AppointmentId ||
            entity.PatientProfileId != state.PatientProfileId ||
            entity.DoctorId != state.DoctorId)
            throw new InvalidOperationException("The clinical record identity is invalid.");

        entity.ChiefComplaint = state.ChiefComplaint;
        entity.Symptoms = state.Symptoms;
        entity.Diagnosis = state.Diagnosis;
        entity.Treatment = state.Treatment;
        entity.DoctorNotes = state.DoctorNotes;
        entity.Status = ToEntityStatus(state.Status);
        entity.UpdatedAt = state.UpdatedAt;
        entity.FinalizedAt = state.FinalizedAt;
        entity.FinalizedByUserId = state.FinalizedByUserId;
    }

    public static ClinicalAuditEvent ToAuditEntity(ClinicalAuditWrite audit) => new()
    {
        Id = Guid.NewGuid(),
        MedicalRecordId = audit.MedicalRecordId,
        ActorUserId = audit.ActorUserId,
        Action = audit.Action,
        OccurredAt = audit.OccurredAt,
        CorrelationId = audit.CorrelationId,
        PreviousRecordVersion = audit.PreviousRecordVersion is null
            ? null
            : RowVersionToken.Decode(audit.PreviousRecordVersion),
        NewRecordVersion = RowVersionToken.Decode(audit.NewRecordVersion)
    };

    public static MedicalRecordContractStatus ToContractStatus(MedicalRecordStatus status) =>
        status switch
        {
            MedicalRecordStatus.Draft => MedicalRecordContractStatus.Draft,
            MedicalRecordStatus.Finalized => MedicalRecordContractStatus.Finalized,
            _ => throw new InvalidOperationException("The clinical record status is invalid.")
        };

    public static MedicalRecordStatus ToEntityStatus(MedicalRecordContractStatus status) =>
        status switch
        {
            MedicalRecordContractStatus.Draft => MedicalRecordStatus.Draft,
            MedicalRecordContractStatus.Finalized => MedicalRecordStatus.Finalized,
            _ => throw new InvalidOperationException("The clinical record status is invalid.")
        };
}

public static class ClinicalSqlConflictClassifier
{
    public const string AppointmentIndexName = "IX_MedicalRecords_AppointmentId";

    public static bool IsDuplicateAppointment(DbUpdateException error) =>
        error.InnerException is SqlException sqlError &&
        sqlError.Errors.Cast<SqlError>().Any(item =>
            IsDuplicateAppointment(item.Number, item.Message));

    public static bool IsDuplicateAppointment(int sqlErrorNumber, string? safeProviderMessage) =>
        (sqlErrorNumber == 2601 || sqlErrorNumber == 2627) &&
        safeProviderMessage?.Contains(AppointmentIndexName, StringComparison.Ordinal) == true;
}

public static class ClinicalPersistenceExceptionClassifier
{
    public static bool IsConcurrency(Exception error) =>
        error is DbUpdateConcurrencyException;
}

public static class ClinicalTransactionCoordinator
{
    public static async Task<T> ExecuteAsync<T>(
        Func<CancellationToken, Task<T>> operation,
        Func<CancellationToken, Task> commit,
        Func<CancellationToken, Task> rollback,
        CancellationToken cancellationToken)
    {
        try
        {
            var result = await operation(cancellationToken);
            await commit(cancellationToken);
            return result;
        }
        catch
        {
            await rollback(CancellationToken.None);
            throw;
        }
    }
}
