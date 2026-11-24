namespace HIS.Api.Exceptions;

public sealed class ScheduleAppointmentConflictException : Exception
{
    public ScheduleAppointmentConflictException()
        : base(
            "This schedule change would invalidate existing future appointments.")
    {
    }
}
