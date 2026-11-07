namespace HIS.Api.Entities;

// Future services append events inside the clinical transaction. Versions are
// snapshots of MedicalRecord.RowVersion, not database-generated audit columns.
public class ClinicalAuditEvent
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid MedicalRecordId { get; set; }
    public Guid ActorUserId { get; set; }
    public string Action { get; set; } = null!;
    public DateTime OccurredAt { get; set; } = DateTime.UtcNow;
    public string CorrelationId { get; set; } = null!;
    public byte[]? PreviousRecordVersion { get; set; }
    public byte[] NewRecordVersion { get; set; } = null!;
    public MedicalRecord MedicalRecord { get; set; } = null!;
    public User ActorUser { get; set; } = null!;
}
