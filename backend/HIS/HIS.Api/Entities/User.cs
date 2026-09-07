using HIS.Api.Enums;
using System.Numerics;

namespace HIS.Api.Entities;

public class User
{
    public Guid Id { get; set; } = Guid.NewGuid();

    public string Email { get; set; } = null!;

    public string PasswordHash { get; set; } = null!;

    public UserRole Role { get; set; }

    public bool IsActive { get; set; } = true;

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public DateTime? UpdatedAt { get; set; }

    public ICollection<PatientProfile> PatientProfiles { get; set; }
        = new List<PatientProfile>();

    public Doctor? Doctor { get; set; }
}