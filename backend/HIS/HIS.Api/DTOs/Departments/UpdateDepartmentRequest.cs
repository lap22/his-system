using System.ComponentModel.DataAnnotations;

namespace HIS.Api.DTOs.Departments;

public class UpdateDepartmentRequest
{
    [Required]
    [StringLength(150)]
    public string Name { get; set; } = null!;

    [StringLength(1000)]
    public string? Description { get; set; }
}