/*
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

'use strict';

const debug = require('debug')('ibm-concerto');
const Globalize = require('./globalize');

const InstanceGenerator = require('./serializer/instancegenerator');
const ValueGeneratorFactory = require('./serializer/valuegenerator');
const ResourceValidator = require('./serializer/resourcevalidator');
const TypedStack = require('./serializer/typedstack');

const Relationship = require('./model/relationship');
const Resource = require('./model/resource');
const ValidatedResource = require('./model/validatedresource');
const Concept = require('./model/concept');
const ValidatedConcept = require('./model/validatedconcept');

const TransactionDeclaration = require('./introspect/transactiondeclaration');

const uuid = require('uuid');


/**
 * Use the Factory to create instances of Resource: transactions, participants
 * and assets.
 * <p><a href="./diagrams/factory.svg"><img src="./diagrams/factory.svg" style="height:100%;"/></a></p>
 * @class
 * @memberof module:composer-common
 */
class Factory {

    /**
     * Create the factory.
     * <p>
     * <strong>Note: Only to be called by framework code. Applications should
     * retrieve instances from {@link Fabric-Composer}</strong>
     * </p>
     * @param {ModelManager} modelManager - The ModelManager to use for this registry
     */
    constructor(modelManager) {
        this.modelManager = modelManager;
    }

    /**
     * Create a new Resource with a given namespace, type name and id
     * @param {string} ns - the namespace of the Resource
     * @param {string} type - the type of the Resource
     * @param {string} id - the identifier
     * @param {Object} [options] - an optional set of options
     * @param {boolean} [options.disableValidation] - pass true if you want the factory to
     * return a {@link Resource} instead of a {@link ValidatedResource}. Defaults to false.
     * @param {boolean} [options.generate] - pass true if you want the factory to return a
     * resource instance with generated sample data.
     * @return {Resource} the new instance
     * @throws {ModelException} if the type is not registered with the ModelManager
     * @deprecated - use newResource instead
     */
    newInstance(ns, type, id, options) {
        return this.newResource(ns, type, id, options);
    }

    /**
     * Create a new Resource with a given namespace, type name and id
     * @param {string} ns - the namespace of the Resource
     * @param {string} type - the type of the Resource
     * @param {string} id - the identifier
     * @param {Object} [options] - an optional set of options
     * @param {boolean} [options.disableValidation] - pass true if you want the factory to
     * return a {@link Resource} instead of a {@link ValidatedResource}. Defaults to false.
     * @param {boolean} [options.generate] - pass true if you want the factory to return a
     * resource instance with generated sample data.
     * @return {Resource} the new instance
     * @throws {ModelException} if the type is not registered with the ModelManager
     */
    newResource(ns, type, id, options) {
        if(!id || typeof(id) !== 'string') {
            let formatter = Globalize.messageFormatter('factory-newinstance-invalididentifier');
            throw new Error(formatter({
                namespace: ns,
                type: type
            }));
        }

        if(id.trim().length === 0) {
            let formatter = Globalize.messageFormatter('factory-newinstance-missingidentifier');
            throw new Error(formatter({
                namespace: ns,
                type: type
            }));
        }

        let modelFile = this.modelManager.getModelFile(ns);
        if(!modelFile) {
            let formatter = Globalize.messageFormatter('factory-newinstance-notregisteredwithmm');
            throw new Error(formatter({
                namespace: ns
            }));
        }

        if(!modelFile.isDefined(type)) {
            let formatter = Globalize.messageFormatter('factory-newinstance-typenotdeclaredinns');

            throw new Error(formatter({
                namespace: ns,
                type: type
            }));
        }

        let classDecl = modelFile.getType(type);
        if(classDecl.isAbstract()) {
            let formatter = Globalize.messageFormatter('factory-newinstance-abstracttype');
            throw new Error(formatter({
                namespace: ns,
                type: type
            }));
        }

        if(classDecl.isConcept()) {
            throw new Error('Use newConcept to create concepts ' + classDecl.getFullyQualifiedName());
        }

        let newObj = null;
        options = options || {};
        if(options.disableValidation) {
            newObj = new Resource(this.modelManager, ns, type, id);
        }
        else {
            newObj = new ValidatedResource(this.modelManager, ns, type, id, new ResourceValidator());
        }
        newObj.assignFieldDefaults();

        if(options.generate) {
            let visitor = new InstanceGenerator();
            const generator = options.withSampleData ? ValueGeneratorFactory.sample() : ValueGeneratorFactory.default();
            let parameters = {
                stack: new TypedStack(newObj),
                modelManager: this.modelManager,
                factory: this,
                valueGenerator: generator
            };
            classDecl.accept(visitor, parameters);
        }

        // if we have an identifier, we set it now
        let idField = classDecl.getIdentifierFieldName();
        newObj[idField] = id;
        debug('Factory.newResource created %s', id );
        return newObj;
    }

    /**
     * Create a new Resource with a given namespace, type name and id
     * @param {string} ns - the namespace of the Resource
     * @param {string} type - the type of the Resource
     * @param {Object} [options] - an optional set of options
     * @param {boolean} [options.disableValidation] - pass true if you want the factory to
     * return a {@link Resource} instead of a {@link ValidatedResource}. Defaults to false.
     * @param {boolean} [options.generate] - pass true if you want the factory to return a
     * resource instance with generated sample data.
     * @return {Resource} the new instance
     * @throws {ModelException} if the type is not registered with the ModelManager
     */
    newConcept(ns, type, options) {
        let modelFile = this.modelManager.getModelFile(ns);
        if(!modelFile) {
            let formatter = Globalize.messageFormatter('factory-newinstance-notregisteredwithmm');
            throw new Error(formatter({
                namespace: ns
            }));
        }

        if(!modelFile.isDefined(type)) {
            let formatter = Globalize.messageFormatter('factory-newinstance-typenotdeclaredinns');

            throw new Error(formatter({
                namespace: ns,
                type: type
            }));
        }

        let classDecl = modelFile.getType(type);

        if(classDecl.isAbstract()) {
            let formatter = Globalize.messageFormatter('factory-newinstance-abstracttype');
            throw new Error(formatter({
                namespace: ns,
                type: type
            }));
        }

        if(!classDecl.isConcept()) {
            throw new Error('Class is not a concept ' + classDecl.getFullyQualifiedName());
        }

        let newObj = null;
        options = options || {};
        if(options.disableValidation) {
            newObj = new Concept(this.modelManager,ns,type);
        }
        else {
            newObj = new ValidatedConcept(this.modelManager,ns,type, new ResourceValidator());
        }
        newObj.assignFieldDefaults();

        if(options.generate) {
            let visitor = new InstanceGenerator();
            let parameters = {
                stack: new TypedStack(newObj),
                modelManager: this.modelManager,
                factory: this
            };
            classDecl.accept(visitor, parameters);
        }

        debug('Factory.newInstance created concept %s', classDecl.getFullyQualifiedName() );
        return newObj;
    }

    /**
     * Create a new Relationship with a given namespace, type and identifier.
`     * A relationship is a typed pointer to an instance. I.e the relationship
     * with namespace = 'org.acme', type = 'Vehicle' and id = 'ABC' creates`
     * a pointer that points at an instance of org.acme.Vehicle with the id
     * ABC.
     *
     * @param {string} ns - the namespace of the Resource
     * @param {string} type - the type of the Resource
     * @param {string} id - the identifier
     * @return {Relationship} - the new relationship instance
     * @throws {ModelException} if the type is not registered with the ModelManager
     */
    newRelationship(ns, type, id) {
        let modelFile = this.modelManager.getModelFile(ns);
        if(!modelFile) {
            let formatter = Globalize.messageFormatter('factory-newrelationship-notregisteredwithmm');

            throw new Error(formatter({
                namespace: ns
            }));
        }

        if(!modelFile.isDefined(type)) {
            let formatter = Globalize.messageFormatter('factory-newinstance-typenotdeclaredinns');

            throw new Error(formatter({
                namespace: ns,
                type: type
            }));
        }

        let relationship = new Relationship(this.modelManager,ns,type,id);
        return relationship;
    }

    /**
     * Create a new transaction object. The identifier of the transaction is
     * set to a UUID.
     * @param {string} ns - the namespace of the transaction.
     * @param {string} type - the type of the transaction.
     * @param {string} [id] - an optional identifier for the transaction; if you do not specify
     * one then an identifier will be automatically generated.
     * @param {Object} [options] - an optional set of options
     * @param {boolean} [options.generate] - pass true if you want the factory to return a
     * resource instance with generated sample data.
     * @return {Resource} A resource for the new transaction.
     */
    newTransaction(ns, type, id, options) {
        if (!ns) {
            throw new Error('ns not specified');
        } else if (!type) {
            throw new Error('type not specified');
        }
        id = id || uuid.v4();
        let transaction = this.newResource(ns, type, id, options);
        const classDeclaration = transaction.getClassDeclaration();

        if (!(classDeclaration instanceof TransactionDeclaration)) {
            throw new Error(transaction.getClassDeclaration().getFullyQualifiedName() + ' is not a transaction');
        }

        // set the timestamp
        transaction.timestamp = new Date();

        return transaction;
    }

    /**
     * Stop serialization of this object.
     * @return {Object} An empty object.
     */
    toJSON() {
        return {};
    }
}

module.exports = Factory;
