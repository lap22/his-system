using System.ComponentModel.DataAnnotations;

namespace HIS.Api.DTOs.Appointments;

public class CancelAppointmentRequest
{
    [MaxLength(1000)]
    public string? Reason { get; set; }
}