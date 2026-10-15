namespace HIS.Api.Helpers;

public static class HospitalClock
{
    private static readonly TimeZoneInfo HospitalTimeZone =
        TimeZoneInfo.FindSystemTimeZoneById(
            "Asia/Ho_Chi_Minh");

    public static DateTime UtcNow =>
        DateTime.UtcNow;

    public static DateTime LocalNow =>
        TimeZoneInfo.ConvertTimeFromUtc(UtcNow, HospitalTimeZone);

    public static DateOnly Today =>
        DateOnly.FromDateTime(LocalNow);
}
