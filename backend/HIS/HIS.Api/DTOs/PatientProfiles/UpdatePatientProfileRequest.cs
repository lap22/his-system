using System.ComponentModel.DataAnnotations;
using HIS.Api.Enums;

namespace HIS.Api.DTOs.PatientProfiles;

public class UpdatePatientProfileRequest
{
    [Required]
    [StringLength(150)]
    public string FullName { get; set; } = null!;

    [Required]
    public DateOnly DateOfBirth { get; set; }

    [Required]
    [StringLength(20)]
    public string Gender { get; set; } = null!;

    [StringLength(20)]
    public string? Phone { get; set; }

    [StringLength(500)]
    public string? Address { get; set; }

    [StringLength(10)]
    public string? BloodType { get; set; }

    [Required]
    public RelationshipType Relationship { get; set; }

    public bool IsDefault { get; set; }
}