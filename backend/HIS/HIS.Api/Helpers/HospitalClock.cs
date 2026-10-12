namespace HIS.Api.Helpers;

public static class HospitalClock
{
    private static readonly TimeZoneInfo HospitalTimeZone =
        TimeZoneInfo.FindSystemTimeZoneById(
            "Asia/Ho_Chi_Minh");

    public static DateTime UtcNow =>
        DateTime.UtcNow;

    public static DateOnly Today =>
        DateOnly.FromDateTime(
            TimeZoneInfo.ConvertTimeFromUtc(
                UtcNow,
                HospitalTimeZone));
}