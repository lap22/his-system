namespace HIS.Api.Services;

// Pure authorization rule kept separate from EF querying so it can be tested
// without a database. AppointmentService supplies only an active, owned Doctor ID.
public static class DoctorAppointmentAccess
{
    public static Guid RequireActiveDoctorId(Guid? doctorId)
    {
        if (doctorId is null)
        {
            throw new KeyNotFoundException(
                "Doctor profile not found.");
        }

        return doctorId.Value;
    }
}
