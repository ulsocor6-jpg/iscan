import {
    ComponentTypes,
    DescriptorVersion
} from "./componentDescriptor.js";

class DescriptorValidator {

    validate(descriptor = {}) {

        const errors = [];

        if (!descriptor.id)
            errors.push("Missing id");

        if (!descriptor.name)
            errors.push("Missing name");

        if (!descriptor.type)
            errors.push("Missing type");

        if (
            descriptor.type &&
            !ComponentTypes.includes(descriptor.type)
        ) {
            errors.push(
                `Unknown component type: ${descriptor.type}`
            );
        }

        if (!descriptor.domain)
            errors.push("Missing domain");

        if (!descriptor.description)
            errors.push("Missing description");

        if (
            descriptor.version &&
            descriptor.version !== DescriptorVersion
        ) {
            errors.push(
                `Descriptor version mismatch (${descriptor.version})`
            );
        }

        return {

            valid: errors.length === 0,

            errors

        };

    }

}

export default new DescriptorValidator();
