namespace HIS.Api.Entities;

public class Prescription
{
    public Guid Id { get; set; } = Guid.NewGuid();

    public Guid MedicalRecordId { get; set; }

    public string? Notes { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public MedicalRecord MedicalRecord { get; set; } = null!;

    public ICollection<PrescriptionItem> Items { get; set; }
        = new List<PrescriptionItem>();
}