using HIS.Api.Enums;

namespace HIS.Api.Entities;

public class MedicalRecord
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid AppointmentId { get; set; }
    public Guid PatientProfileId { get; set; }
    public Guid DoctorId { get; set; }
    public string? ChiefComplaint { get; set; }
    public string? Symptoms { get; set; }
    public string? Diagnosis { get; set; }
    public string? Treatment { get; set; }
    public string? DoctorNotes { get; set; }
    public MedicalRecordStatus Status { get; set; } = MedicalRecordStatus.Draft;
    public DateTime? FinalizedAt { get; set; }
    public Guid? FinalizedByUserId { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime? UpdatedAt { get; set; }
    public byte[] RowVersion { get; set; } = [];
    public Appointment Appointment { get; set; } = null!;
    public PatientProfile PatientProfile { get; set; } = null!;
    public Doctor Doctor { get; set; } = null!;
    public User? FinalizedByUser { get; set; }
    public Prescription? Prescription { get; set; }
    public ICollection<ClinicalAuditEvent> AuditEvents { get; set; } = [];
}
