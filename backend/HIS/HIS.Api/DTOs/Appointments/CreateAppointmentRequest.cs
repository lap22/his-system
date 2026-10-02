using System.ComponentModel.DataAnnotations;

namespace HIS.Api.DTOs.Appointments;

public class CreateAppointmentRequest
{
    [Required]
    public Guid PatientProfileId { get; set; }

    [Required]
    public Guid DoctorId { get; set; }

    [Required]
    public DateOnly AppointmentDate { get; set; }

    [Required]
    public TimeOnly StartTime { get; set; }

    [MaxLength(2000)]
    public string? Symptoms { get; set; }
}