using System.IO.Pipelines;
using Microsoft.AspNetCore.Hosting.Server;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Http.Features;

namespace HIS.Api.ClinicalHttpHostedTests;

public sealed class InMemoryServer : IServer
{
    private Func<IFeatureCollection, Task>? processRequest;
    public IFeatureCollection Features { get; } = new FeatureCollection();

    public Task StartAsync<TContext>(
        IHttpApplication<TContext> application, CancellationToken cancellationToken)
        where TContext : notnull
    {
        processRequest = async features =>
        {
            var context = application.CreateContext(features);
            Exception? error = null;
            try
            {
                await application.ProcessRequestAsync(context);
            }
            catch (Exception caught)
            {
                error = caught;
                throw;
            }
            finally
            {
                application.DisposeContext(context, error);
            }
        };
        return Task.CompletedTask;
    }

    public Task StopAsync(CancellationToken cancellationToken) => Task.CompletedTask;

    public async Task<HostedResponse> SendAsync(
        string method, string path, string? json = null,
        Guid? userId = null, string? role = null)
    {
        if (processRequest is null)
            throw new InvalidOperationException("The in-memory host is not started.");

        var requestBody = new MemoryStream();
        if (json is not null)
        {
            await using var writer = new StreamWriter(requestBody, leaveOpen: true);
            await writer.WriteAsync(json);
            await writer.FlushAsync();
            requestBody.Position = 0;
        }
        var responseBody = new MemoryStream();
        var requestHeaders = new HeaderDictionary();
        if (json is not null) requestHeaders["Content-Type"] = "application/json";
        if (userId is not null) requestHeaders["X-Test-UserId"] = userId.Value.ToString();
        if (role is not null) requestHeaders["X-Test-Role"] = role;

        var request = new HttpRequestFeature
        {
            Method = method,
            Scheme = "http",
            Path = path,
            RawTarget = path,
            Protocol = "HTTP/1.1",
            Headers = requestHeaders,
            Body = requestBody
        };
        var response = new HttpResponseFeature
        {
            StatusCode = StatusCodes.Status200OK,
            Headers = new HeaderDictionary(),
            Body = responseBody
        };
        var features = new FeatureCollection();
        features.Set<IHttpRequestFeature>(request);
        features.Set<IHttpResponseFeature>(response);
        features.Set<IHttpResponseBodyFeature>(new StreamResponseBodyFeature(responseBody));
        features.Set<IHttpRequestBodyDetectionFeature>(new RequestBodyDetectionFeature(json is not null));
        features.Set<IHttpResponseTrailersFeature>(new ResponseTrailersFeature());
        features.Set<IHttpUpgradeFeature>(new UpgradeFeature());
        features.Set<IHttpRequestLifetimeFeature>(new RequestLifetimeFeature());

        await processRequest(features);
        responseBody.Position = 0;
        using var reader = new StreamReader(responseBody);
        return new HostedResponse(response.StatusCode, await reader.ReadToEndAsync(), response.Headers);
    }

    public void Dispose() { }

    private sealed class RequestBodyDetectionFeature(bool canHaveBody)
        : IHttpRequestBodyDetectionFeature
    {
        public bool CanHaveBody { get; } = canHaveBody;
    }

    private sealed class ResponseTrailersFeature : IHttpResponseTrailersFeature
    {
        public IHeaderDictionary Trailers { get; set; } = new HeaderDictionary();
    }

    private sealed class UpgradeFeature : IHttpUpgradeFeature
    {
        public bool IsUpgradableRequest => false;
        public Task<Stream> UpgradeAsync() => throw new NotSupportedException();
    }

    private sealed class RequestLifetimeFeature : IHttpRequestLifetimeFeature
    {
        public CancellationToken RequestAborted { get; set; }
        public void Abort() { }
    }
}

public sealed record HostedResponse(
    int StatusCode, string Body, IHeaderDictionary Headers);
