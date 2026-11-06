using HIS.Api.DTOs.MedicalRecords;

namespace HIS.Api.Services.Clinical;

// Reviewed source-only target. These constants are not executed by the API.
public static class MedicalRecordSchemaContract
{
    public const string StatusCheckSql =
        "[Status] IN (N'Draft', N'Finalized')";

    public const string LifecycleCheckSql =
        "([Status] = N'Draft' AND [FinalizedAt] IS NULL AND [FinalizedByUserId] IS NULL) OR " +
        "([Status] = N'Finalized' AND [FinalizedAt] IS NOT NULL AND [FinalizedByUserId] IS NOT NULL " +
        "AND [ChiefComplaint] IS NOT NULL AND LEN(LTRIM(RTRIM([ChiefComplaint]))) > 0 " +
        "AND [Diagnosis] IS NOT NULL AND LEN(LTRIM(RTRIM([Diagnosis]))) > 0)";

    public static bool IsValidLifecycle(MedicalRecordContractStatus status,
        string? chiefComplaint, string? diagnosis,
        DateTime? finalizedAt, Guid? finalizedByUserId) => status switch
    {
        MedicalRecordContractStatus.Draft =>
            finalizedAt is null && finalizedByUserId is null,
        MedicalRecordContractStatus.Finalized =>
            !string.IsNullOrWhiteSpace(chiefComplaint) &&
            !string.IsNullOrWhiteSpace(diagnosis) &&
            finalizedAt is not null && finalizedByUserId is not null,
        _ => false
    };
}
