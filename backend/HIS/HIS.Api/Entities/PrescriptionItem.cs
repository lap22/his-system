namespace HIS.Api.Entities;

public class PrescriptionItem
{
    public Guid Id { get; set; } = Guid.NewGuid();

    public Guid PrescriptionId { get; set; }

    public string MedicineName { get; set; } = null!;

    public string Dosage { get; set; } = null!;

    public string Frequency { get; set; } = null!;

    public string Duration { get; set; } = null!;

    public string? Instructions { get; set; }

    public Prescription Prescription { get; set; } = null!;
}