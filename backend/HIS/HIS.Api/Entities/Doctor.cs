namespace HIS.Api.Entities;

public class Doctor
{
    public Guid Id { get; set; } = Guid.NewGuid();

    public Guid UserId { get; set; }

    public Guid DepartmentId { get; set; }

    public string FullName { get; set; } = null!;

    public string? Phone { get; set; }

    public string Specialization { get; set; } = null!;

    public string LicenseNumber { get; set; } = null!;

    public int YearsOfExperience { get; set; }

    public string? Biography { get; set; }

    public string? AvatarUrl { get; set; }

    public bool IsActive { get; set; } = true;

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public DateTime? UpdatedAt { get; set; }

    public User User { get; set; } = null!;

    public Department Department { get; set; } = null!;

    public ICollection<DoctorSchedule> Schedules { get; set; }
        = new List<DoctorSchedule>();

    public ICollection<Appointment> Appointments { get; set; }
        = new List<Appointment>();

    public ICollection<MedicalRecord> MedicalRecords { get; set; }
        = new List<MedicalRecord>();
}