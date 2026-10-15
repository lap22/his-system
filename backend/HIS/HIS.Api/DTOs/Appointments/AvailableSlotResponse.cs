namespace HIS.Api.DTOs.Appointments;

using HIS.Api.Enums;

public class AvailableSlotResponse
{
    public TimeOnly StartTime { get; set; }

    public TimeOnly EndTime { get; set; }

    public bool IsAvailable => Reason == SlotAvailabilityReason.Available;

    public SlotAvailabilityReason Reason { get; set; } = SlotAvailabilityReason.Available;
}
