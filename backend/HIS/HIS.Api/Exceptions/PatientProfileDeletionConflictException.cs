namespace HIS.Api.Exceptions;

public class PatientProfileDeletionConflictException : Exception
{
    public PatientProfileDeletionConflictException(Exception? innerException = null)
        : base(
            "This patient profile cannot be deleted because it has appointment history.",
            innerException)
    {
    }
}
