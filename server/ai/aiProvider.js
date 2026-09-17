class AiProvider {
  async generateStructured(_request) {
    throw new Error('AiProvider.generateStructured must be implemented');
  }
}

class FakeAiProvider extends AiProvider {
  constructor(resultOrFactory) {
    super();
    this.resultOrFactory = resultOrFactory;
    this.requests = [];
  }

  async generateStructured(request) {
    this.requests.push(request);
    return typeof this.resultOrFactory === 'function'
      ? this.resultOrFactory(request)
      : this.resultOrFactory;
  }
}

module.exports = { AiProvider, FakeAiProvider };
