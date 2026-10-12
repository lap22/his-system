namespace HIS.Api.Exceptions;

public class QueueConcurrencyException : Exception
{
    public QueueConcurrencyException()
        : base(
            "Queue entry was modified by another request. Please refresh and try again.")
    {
    }
}