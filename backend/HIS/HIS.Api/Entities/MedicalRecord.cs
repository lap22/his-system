namespace HIS.Api.Entities;

public class MedicalRecord
{
    public Guid Id { get; set; } = Guid.NewGuid();

    public Guid AppointmentId { get; set; }

    public Guid PatientProfileId { get; set; }

    public Guid DoctorId { get; set; }

    public string ChiefComplaint { get; set; } = null!;

    public string? Symptoms { get; set; }

    public string Diagnosis { get; set; } = null!;

    public string? Treatment { get; set; }

    public string? DoctorNotes { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public DateTime? UpdatedAt { get; set; }

    public Appointment Appointment { get; set; } = null!;

    public PatientProfile PatientProfile { get; set; } = null!;

    public Doctor Doctor { get; set; } = null!;

    public Prescription? Prescription { get; set; }
}