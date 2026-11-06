using System.ComponentModel.DataAnnotations;

namespace HIS.Api.DTOs.MedicalRecords;

public static class RowVersionToken
{
    public const int ByteLength = 8;

    public static string Encode(ReadOnlySpan<byte> value)
    {
        if (value.Length != ByteLength)
            throw new RowVersionTokenException();
        return Convert.ToBase64String(value);
    }

    public static byte[] Decode(string? token)
    {
        if (!TryDecode(token, out var value))
            throw new RowVersionTokenException();
        return value;
    }

    public static bool TryDecode(string? token, out byte[] value)
    {
        value = [];
        if (string.IsNullOrEmpty(token)) return false;
        try
        {
            var decoded = Convert.FromBase64String(token);
            if (decoded.Length != ByteLength ||
                !string.Equals(Convert.ToBase64String(decoded), token,
                    StringComparison.Ordinal))
                return false;
            value = decoded;
            return true;
        }
        catch (FormatException)
        {
            return false;
        }
    }
}

public sealed class RowVersionTokenException : FormatException
{
    public RowVersionTokenException()
        : base("The concurrency token is invalid.") { }
}

[AttributeUsage(AttributeTargets.Property | AttributeTargets.Field | AttributeTargets.Parameter)]
public sealed class RowVersionTokenAttribute : ValidationAttribute
{
    public RowVersionTokenAttribute() : base("The concurrency token is invalid.") { }
    public override bool IsValid(object? value) =>
        value is string token && RowVersionToken.TryDecode(token, out _);
}
