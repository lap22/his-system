using System.Net;
using System.Text.Json;

namespace HIS.Api.Middleware;

public class ExceptionHandlingMiddleware
{
    private readonly RequestDelegate _next;
    private readonly ILogger<ExceptionHandlingMiddleware> _logger;

    public ExceptionHandlingMiddleware(
        RequestDelegate next,
        ILogger<ExceptionHandlingMiddleware> logger)
    {
        _next = next;
        _logger = logger;
    }

    public async Task InvokeAsync(
        HttpContext context)
    {
        try
        {
            await _next(context);
        }
        catch (UnauthorizedAccessException ex)
        {
            await WriteErrorResponseAsync(
                context,
                HttpStatusCode.Unauthorized,
                ex.Message
            );
        }
        catch (InvalidOperationException ex)
        {
            await WriteErrorResponseAsync(
                context,
                HttpStatusCode.BadRequest,
                ex.Message
            );
        }
        catch (Exception ex)
        {
            _logger.LogError(
                ex,
                "Unhandled exception occurred."
            );

            await WriteErrorResponseAsync(
                context,
                HttpStatusCode.InternalServerError,
                "An unexpected error occurred."
            );
        }
    }

    private static async Task WriteErrorResponseAsync(
        HttpContext context,
        HttpStatusCode statusCode,
        string message)
    {
        context.Response.StatusCode =
            (int)statusCode;

        context.Response.ContentType =
            "application/json";

        var response = new
        {
            statusCode = (int)statusCode,
            message
        };

        await context.Response.WriteAsync(
            JsonSerializer.Serialize(response)
        );
    }
}