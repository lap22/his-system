using System.ComponentModel.DataAnnotations;

namespace HIS.Api.DTOs.Doctors;

public class CreateDoctorRequest
{
    // Account
    [Required]
    [EmailAddress]
    [StringLength(255)]
    public string Email { get; set; } = null!;

    [Required]
    [MinLength(8)]
    [StringLength(100)]
    public string Password { get; set; } = null!;

    // Doctor profile
    [Required]
    public Guid DepartmentId { get; set; }

    [Required]
    [StringLength(150)]
    public string FullName { get; set; } = null!;

    [StringLength(20)]
    public string? Phone { get; set; }

    [Required]
    [StringLength(150)]
    public string Specialization { get; set; } = null!;

    [Required]
    [StringLength(100)]
    public string LicenseNumber { get; set; } = null!;

    [Range(0, 80)]
    public int YearsOfExperience { get; set; }

    [StringLength(2000)]
    public string? Biography { get; set; }

    [StringLength(1000)]
    public string? AvatarUrl { get; set; }
}