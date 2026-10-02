namespace HIS.Api.DTOs.Appointments;

public class AvailableSlotResponse
{
    public TimeOnly StartTime { get; set; }

    public TimeOnly EndTime { get; set; }
}