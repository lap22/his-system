using HIS.Api.DTOs.MedicalRecords;
using HIS.Api.Enums;

namespace HIS.Api.Services.Clinical;

public enum MedicalRecordPolicyFailure
{
    None,
    RoleDenied,
    InactiveDoctor,
    AppointmentNotAssigned,
    AppointmentNotInProgress,
    RecordAlreadyExists,
    RecordNotDraft,
    MissingConcurrencyToken,
    StaleConcurrencyToken,
    PatientProfileNotOwned,
    RecordNotFinalized
}

public readonly record struct MedicalRecordPolicyResult(
    MedicalRecordPolicyFailure Failure)
{
    public bool Allowed => Failure == MedicalRecordPolicyFailure.None;
    public static MedicalRecordPolicyResult Permit() => new(MedicalRecordPolicyFailure.None);
    public static MedicalRecordPolicyResult Deny(MedicalRecordPolicyFailure failure) => new(failure);
}

// Pure proposed policy. It accepts identifiers/status facts only and therefore
// cannot log or leak clinical content. Future services must obtain these facts
// authoritatively in one transaction rather than trusting client input.
public static class MedicalRecordPolicy
{
    public const bool AutomaticallyRetryMutations = false;

    public static MedicalRecordPolicyResult CanCreateDraft(
        string role, bool doctorIsActive, Guid authenticatedDoctorId,
        Guid appointmentDoctorId, AppointmentStatus appointmentStatus,
        bool recordAlreadyExists)
    {
        var access = CanDoctorMutate(role, doctorIsActive,
            authenticatedDoctorId, appointmentDoctorId, appointmentStatus);
        if (!access.Allowed) return access;
        return recordAlreadyExists
            ? MedicalRecordPolicyResult.Deny(MedicalRecordPolicyFailure.RecordAlreadyExists)
            : MedicalRecordPolicyResult.Permit();
    }

    public static MedicalRecordPolicyResult CanMutateDraft(
        string role, bool doctorIsActive, Guid authenticatedDoctorId,
        Guid appointmentDoctorId, AppointmentStatus appointmentStatus,
        MedicalRecordContractStatus recordStatus, string? suppliedVersion,
        string authoritativeVersion)
    {
        var access = CanDoctorMutate(role, doctorIsActive,
            authenticatedDoctorId, appointmentDoctorId, appointmentStatus);
        if (!access.Allowed) return access;
        if (recordStatus != MedicalRecordContractStatus.Draft)
            return MedicalRecordPolicyResult.Deny(MedicalRecordPolicyFailure.RecordNotDraft);
        if (string.IsNullOrWhiteSpace(suppliedVersion))
            return MedicalRecordPolicyResult.Deny(MedicalRecordPolicyFailure.MissingConcurrencyToken);
        return string.Equals(suppliedVersion, authoritativeVersion,
                StringComparison.Ordinal)
            ? MedicalRecordPolicyResult.Permit()
            : MedicalRecordPolicyResult.Deny(MedicalRecordPolicyFailure.StaleConcurrencyToken);
    }

    public static MedicalRecordPolicyResult CanPatientRead(
        string role, Guid authenticatedUserId, Guid profileOwnerUserId,
        MedicalRecordContractStatus status)
    {
        if (!string.Equals(role, UserRole.Patient.ToString(), StringComparison.Ordinal))
            return MedicalRecordPolicyResult.Deny(MedicalRecordPolicyFailure.RoleDenied);
        if (authenticatedUserId != profileOwnerUserId)
            return MedicalRecordPolicyResult.Deny(MedicalRecordPolicyFailure.PatientProfileNotOwned);
        return status == MedicalRecordContractStatus.Finalized
            ? MedicalRecordPolicyResult.Permit()
            : MedicalRecordPolicyResult.Deny(MedicalRecordPolicyFailure.RecordNotFinalized);
    }

    private static MedicalRecordPolicyResult CanDoctorMutate(
        string role, bool doctorIsActive, Guid authenticatedDoctorId,
        Guid appointmentDoctorId, AppointmentStatus appointmentStatus)
    {
        if (!string.Equals(role, UserRole.Doctor.ToString(), StringComparison.Ordinal))
            return MedicalRecordPolicyResult.Deny(MedicalRecordPolicyFailure.RoleDenied);
        if (!doctorIsActive)
            return MedicalRecordPolicyResult.Deny(MedicalRecordPolicyFailure.InactiveDoctor);
        if (authenticatedDoctorId != appointmentDoctorId)
            return MedicalRecordPolicyResult.Deny(MedicalRecordPolicyFailure.AppointmentNotAssigned);
        return appointmentStatus == AppointmentStatus.InProgress
            ? MedicalRecordPolicyResult.Permit()
            : MedicalRecordPolicyResult.Deny(MedicalRecordPolicyFailure.AppointmentNotInProgress);
    }
}
